/**
 * validator.mjs
 *
 * Abstraction: ContractValidator
 * Purpose: Compile governance contracts into executable validation functions
 *
 * Core design principles:
 *   - Pure functions: no side effects, no external state mutation
 *   - Composable: validators can be combined and chained
 *   - Testable: all validation logic is executable, not prompt-based
 *   - Localizable: error messages support parameter interpolation and i18n
 *   - Cached: compiled validators are cached for performance
 *
 * Architecture:
 *   - ContractLoader: loads and parses JSON contract files
 *   - RuleCompiler: transforms contract check definitions into validation functions
 *   - MessageFormatter: generates localized error messages with parameter interpolation
 *   - ValidatorCache: caches compiled validators to avoid recompilation
 *   - ValidatorEngine: main API surface for validation operations
 *
 * Usage:
 *   import { validateWorkerExecutionEvidence } from './validator.mjs';
 *   const result = validateWorkerExecutionEvidence(evidence, contract);
 *   if (!result.valid) {
 *     console.error(result.errors);
 *   }
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

// ============================================================================
// SECTION 1: Core Data Structures
// ============================================================================

/**
 * Validation result envelope
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - True if all checks passed
 * @property {ValidationError[]} errors - Critical validation failures
 * @property {ValidationWarning[]} warnings - Non-blocking issues
 * @property {Object} metadata - Additional validation context
 */

/**
 * Validation error with localization support
 * @typedef {Object} ValidationError
 * @property {string} code - Error code for programmatic handling
 * @property {string} message - Localized error message with interpolated parameters
 * @property {string} path - JSON path to the invalid value
 * @property {*} actual - The actual value that failed validation
 * @property {*} expected - The expected value or constraint
 * @property {Object} params - Parameters for message interpolation
 */

/**
 * Non-blocking validation warning
 * @typedef {Object} ValidationWarning
 * @property {string} code - Warning code
 * @property {string} message - Localized warning message
 * @property {string} path - JSON path to the problematic value
 * @property {Object} params - Parameters for message interpolation
 */

// ============================================================================
// SECTION 2: Message Formatter with i18n Support
// ============================================================================

/**
 * Message template cache
 * Format: Map<messageCode, Map<locale, MessageTemplate>>
 */
const MESSAGE_CACHE = new Map();

/**
 * Default locale fallback chain
 * When a message is not found in the requested locale, falls back through this chain.
 */
const DEFAULT_LOCALE_CHAIN = ['en-US', 'en', 'und'];

/**
 * Compiled message template
 * @typedef {Object} MessageTemplate
 * @property {string} template - Message template with {{param}} placeholders
 * @property {string[]} params - Required parameter names
 * @property {Set<string>} locales - Available locales for this message
 */

/**
 * Compiles a message template into a reusable format
 * Template format: "Field {{field}} must be one of {{allowed}}, got: {{actual}}"
 *
 * @param {string} template - Message template with {{param}} placeholders
 * @returns {MessageTemplate} Compiled template
 */
function compileMessageTemplate(template) {
  const paramMatches = template.match(/\{\{(\w+)\}\}/g) || [];
  const params = paramMatches.map(m => m.slice(2, -2));

  return {
    template,
    params,
    locales: new Set()
  };
}

/**
 * Formats a message with parameter interpolation
 *
 * @param {string} template - Message template
 * @param {Object} params - Parameter values
 * @param {string} locale - Target locale
 * @returns {string} Formatted message
 */
function formatMessage(template, params = {}, locale = 'en-US') {
  let result = template;

  for (const [key, value] of Object.entries(params)) {
    const placeholder = `{{${key}}}`;
    result = result.replace(new RegExp(placeholder, 'g'), String(value ?? ''));
  }

  return result;
}

/**
 * Gets a localized message from the message registry
 * Implements locale fallback chain: requested -> en-US -> en -> und
 *
 * @param {string} code - Message code
 * @param {Object} params - Parameters for interpolation
 * @param {string} locale - Target locale
 * @returns {string} Localized message
 */
export function getMessage(code, params = {}, locale = 'en-US') {
  const templateSet = MESSAGE_CACHE.get(code);

  if (!templateSet) {
    return `[missing:${code}]`;
  }

  // Try requested locale, then fallback chain
  const searchLocales = [locale, ...DEFAULT_LOCALE_CHAIN];

  for (const searchLocale of searchLocales) {
    if (templateSet.has(searchLocale)) {
      const template = templateSet.get(searchLocale);
      return formatMessage(template, params, locale);
    }
  }

  return `[missing:${code}:${locale}]`;
}

/**
 * Registers message templates for a given code
 *
 * @param {string} code - Message code
 * @param {Object.<string, string>} messages - Map of locale -> template
 */
export function registerMessages(code, messages) {
  if (!MESSAGE_CACHE.has(code)) {
    MESSAGE_CACHE.set(code, new Map());
  }

  const templateSet = MESSAGE_CACHE.get(code);

  for (const [locale, template] of Object.entries(messages)) {
    templateSet.set(locale, template);
  }
}

/**
 * Bulk registers messages from a contract format
 *
 * @param {Object.<string, Object.<string, string>>} messageRegistry - Nested message registry
 */
export function registerMessageRegistry(messageRegistry) {
  for (const [code, locales] of Object.entries(messageRegistry)) {
    registerMessages(code, locales);
  }
}

// ============================================================================
// SECTION 3: Contract Loader
// ============================================================================

/**
 * Contract file cache
 * Map<contractPath, ParsedContract>
 */
const CONTRACT_CACHE = new Map();

/**
 * Contract modification timestamps for cache invalidation
 * Map<contractPath, mtimeMs>
 */
const CONTRACT_MTIMES = new Map();

/**
 * Default contract locations
 */
const DEFAULT_CONTRACT_PATHS = {
  workflow: 'config/contracts/workflow-contract.json',
  capabilityIndex: 'config/contracts/capability-index.schema.json',
  localizedTriggers: 'config/contracts/localized-trigger-exceptions.json',
  evolution: 'config/contracts/evolution-contract.json',
  deliverableProfiles: 'config/contracts/deliverable-type-profiles.json'
};

/**
 * Loads and parses a JSON contract file
 * Implements caching with mtime-based invalidation
 *
 * @param {string} contractPath - Absolute or relative path to contract
 * @param {Object} options - Loading options
 * @param {boolean} options.useCache - Enable caching (default: true)
 * @param {string} options.baseDir - Base directory for relative paths
 * @returns {Promise<Object>} Parsed contract object
 * @throws {Error} If file not found or invalid JSON
 */
export async function loadValidationContract(contractPath, options = {}) {
  const {
    useCache = true,
    baseDir = process.cwd()
  } = options;

  const resolvedPath = path.resolve(baseDir, contractPath);

  // Check cache if enabled
  if (useCache && CONTRACT_CACHE.has(resolvedPath)) {
    try {
      const stats = await fs.stat(resolvedPath);
      const cachedMtime = CONTRACT_MTIMES.get(resolvedPath);

      if (cachedMtime === stats.mtimeMs) {
        return CONTRACT_CACHE.get(resolvedPath);
      }

      // Cache invalidated, remove stale entry
      CONTRACT_CACHE.delete(resolvedPath);
      CONTRACT_MTIMES.delete(resolvedPath);
    } catch {
      // File may have been deleted, continue to load
    }
  }

  // Load from disk
  const raw = await fs.readFile(resolvedPath, 'utf8');
  const contract = JSON.parse(raw);

  // Store in cache
  if (useCache) {
    const stats = await fs.stat(resolvedPath);
    CONTRACT_CACHE.set(resolvedPath, contract);
    CONTRACT_MTIMES.set(resolvedPath, stats.mtimeMs);
  }

  return contract;
}

/**
 * Loads multiple contracts by name from default locations
 *
 * @param {string[]} contractNames - Contract names to load
 * @param {Object} options - Loading options
 * @returns {Promise<Object.<string, Object>>} Map of contract name -> parsed contract
 */
export async function loadContracts(contractNames, options = {}) {
  const result = {};

  for (const name of contractNames) {
    const defaultPath = DEFAULT_CONTRACT_PATHS[name];
    if (defaultPath) {
      result[name] = await loadValidationContract(defaultPath, options);
    }
  }

  return result;
}

/**
 * Clears the contract cache
 * Useful for testing or when contracts are updated externally
 */
export function clearContractCache() {
  CONTRACT_CACHE.clear();
  CONTRACT_MTIMES.clear();
}

/**
 * Gets cache statistics for monitoring
 *
 * @returns {Object} Cache statistics
 */
export function getContractCacheStats() {
  return {
    size: CONTRACT_CACHE.size,
    contracts: Array.from(CONTRACT_CACHE.keys())
  };
}

// ============================================================================
// SECTION 4: Rule Compiler
// ============================================================================

/**
 * Compiled validator function type
 * @callback ValidatorFunction
 * @param {*} value - Value to validate
 * @param {Object} context - Validation context (path, locale, etc.)
 * @returns {ValidationResult} Validation result
 */

/**
 * Rule compilation cache
 * Map<ruleId, CompiledValidator>
 */
const RULE_CACHE = new Map();

/**
 * Built-in validator types
 */
const VALIDATOR_TYPES = {
  // Type validators
  'type': compileTypeValidator,
  'enum': compileEnumValidator,
  'array': compileArrayValidator,
  'object': compileObjectValidator,
  'string': compileStringValidator,
  'number': compileNumberValidator,
  'boolean': compileBooleanValidator,

  // Constraint validators
  'required': compileRequiredValidator,
  'minLength': compileMinLengthValidator,
  'maxLength': compileMaxLengthValidator,
  'pattern': compilePatternValidator,
  'min': compileMinValidator,
  'max': compileMaxValidator,

  // Structural validators
  'fields': compileFieldsValidator,
  'noUnexpectedFields': compileNoUnexpectedFieldsValidator,

  // Custom validators
  'custom': compileCustomValidator,
  'ref': compileRefValidator
};

/**
 * Compiles a rule definition into an executable validator function
 *
 * @param {Object} check - Rule check definition from contract
 * @param {Object} context - Compilation context
 * @returns {ValidatorFunction} Compiled validator
 */
export function compileRule(check, context = {}) {
  const cacheKey = JSON.stringify(check);

  if (RULE_CACHE.has(cacheKey)) {
    return RULE_CACHE.get(cacheKey);
  }

  const { type = 'custom' } = check;
  const compiler = VALIDATOR_TYPES[type];

  if (!compiler) {
    throw new Error(`Unknown validator type: ${type}`);
  }

  const validator = compiler(check, context);
  RULE_CACHE.set(cacheKey, validator);

  return validator;
}

/**
 * Compiles a type validator
 */
function compileTypeValidator(check, context) {
  const { expectedType } = check;

  return function validateType(value, ctx = {}) {
    const actualType = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;

    if (actualType !== expectedType) {
      return {
        valid: false,
        errors: [{
          code: 'type.mismatch',
          message: getMessage('type.mismatch', {
            field: ctx.path || 'value',
            expected: expectedType,
            actual: actualType
          }, ctx.locale),
          path: ctx.path || '',
          actual: actualType,
          expected: expectedType
        }],
        warnings: []
      };
    }

    return { valid: true, errors: [], warnings: [] };
  };
}

/**
 * Compiles an enum validator
 */
function compileEnumValidator(check, context) {
  const { allowed } = check;
  const allowedSet = new Set(allowed);

  return function validateEnum(value, ctx = {}) {
    if (!allowedSet.has(value)) {
      return {
        valid: false,
        errors: [{
          code: 'enum.invalid',
          message: getMessage('enum.invalid', {
            field: ctx.path || 'value',
            value: String(value),
            allowed: Array.from(allowedSet).join(', ')
          }, ctx.locale),
          path: ctx.path || '',
          actual: value,
          expected: Array.from(allowedSet)
        }],
        warnings: []
      };
    }

    return { valid: true, errors: [], warnings: [] };
  };
}

/**
 * Compiles an array validator
 */
function compileArrayValidator(check, context) {
  const { itemValidator, minLength, maxLength } = check;
  const compiledItem = itemValidator ? compileRule(itemValidator, context) : null;

  return function validateArray(value, ctx = {}) {
    if (!Array.isArray(value)) {
      return {
        valid: false,
        errors: [{
          code: 'array.expected',
          message: getMessage('array.expected', {
            field: ctx.path || 'value'
          }, ctx.locale),
          path: ctx.path || '',
          actual: Array.isArray(value) ? 'array' : typeof value,
          expected: 'array'
        }],
        warnings: []
      };
    }

    const errors = [];
    const warnings = [];

    // Length constraints
    if (minLength !== undefined && value.length < minLength) {
      errors.push({
        code: 'array.tooShort',
        message: getMessage('array.tooShort', {
          field: ctx.path || 'value',
          length: value.length,
          min: minLength
        }, ctx.locale),
        path: ctx.path || ''
      });
    }

    if (maxLength !== undefined && value.length > maxLength) {
      errors.push({
        code: 'array.tooLong',
        message: getMessage('array.tooLong', {
          field: ctx.path || 'value',
          length: value.length,
          max: maxLength
        }, ctx.locale),
        path: ctx.path || ''
      });
    }

    // Item validation
    if (compiledItem) {
      for (let i = 0; i < value.length; i++) {
        const itemPath = ctx.path ? `${ctx.path}[${i}]` : `[${i}]`;
        const result = compiledItem(value[i], { ...ctx, path: itemPath });

        if (!result.valid) {
          errors.push(...result.errors);
        }
        warnings.push(...result.warnings);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  };
}

/**
 * Compiles an object validator
 */
function compileObjectValidator(check, context) {
  const { properties = {}, additionalProperties = true } = check;
  const compiledProperties = {};

  for (const [propName, propCheck] of Object.entries(properties)) {
    compiledProperties[propName] = compileRule(propCheck, context);
  }

  return function validateObject(value, ctx = {}) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return {
        valid: false,
        errors: [{
          code: 'object.expected',
          message: getMessage('object.expected', {
            field: ctx.path || 'value'
          }, ctx.locale),
          path: ctx.path || '',
          actual: value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value,
          expected: 'object'
        }],
        warnings: []
      };
    }

    const errors = [];
    const warnings = [];

    // Validate known properties
    for (const [propName, validator] of Object.entries(compiledProperties)) {
      const propPath = ctx.path ? `${ctx.path}.${propName}` : propName;

      if (propName in value) {
        const result = validator(value[propName], { ...ctx, path: propPath });
        if (!result.valid) {
          errors.push(...result.errors);
        }
        warnings.push(...result.warnings);
      }
    }

    // Check for unexpected properties
    if (!additionalProperties) {
      const allowedProps = new Set(Object.keys(properties));
      for (const propName of Object.keys(value)) {
        if (!allowedProps.has(propName)) {
          warnings.push({
            code: 'object.unexpectedProperty',
            message: getMessage('object.unexpectedProperty', {
              field: ctx.path || 'value',
              property: propName
            }, ctx.locale),
            path: ctx.path ? `${ctx.path}.${propName}` : propName
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  };
}

/**
 * Compiles a required fields validator
 */
function compileRequiredValidator(check, context) {
  const { fields = [] } = check;

  return function validateRequired(value, ctx = {}) {
    const errors = [];

    if (typeof value !== 'object' || value === null) {
      return {
        valid: false,
        errors: [{
          code: 'required.notObject',
          message: getMessage('required.notObject', {
            field: ctx.path || 'value'
          }, ctx.locale),
          path: ctx.path || ''
        }],
        warnings: []
      };
    }

    for (const field of fields) {
      if (!(field in value) || value[field] === undefined) {
        errors.push({
          code: 'required.missing',
          message: getMessage('required.missing', {
            field: ctx.path ? `${ctx.path}.${field}` : field
          }, ctx.locale),
          path: ctx.path ? `${ctx.path}.${field}` : field
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: []
    };
  };
}

/**
 * Compiles a fields validator (validates specified fields exist and match schema)
 */
function compileFieldsValidator(check, context) {
  const { fieldDefs = {} } = check;
  const compiledFields = {};

  for (const [fieldName, fieldCheck] of Object.entries(fieldDefs)) {
    compiledFields[fieldName] = compileRule(fieldCheck, context);
  }

  return function validateFields(value, ctx = {}) {
    if (typeof value !== 'object' || value === null) {
      return {
        valid: false,
        errors: [{
          code: 'fields.notObject',
          message: getMessage('fields.notObject', {
            field: ctx.path || 'value'
          }, ctx.locale),
          path: ctx.path || ''
        }],
        warnings: []
      };
    }

    const errors = [];
    const warnings = [];

    for (const [fieldName, validator] of Object.entries(compiledFields)) {
      if (!(fieldName in value)) {
        errors.push({
          code: 'fields.missing',
          message: getMessage('fields.missing', {
            field: ctx.path ? `${ctx.path}.${fieldName}` : fieldName
          }, ctx.locale),
          path: ctx.path ? `${ctx.path}.${fieldName}` : fieldName
        });
        continue;
      }

      const fieldPath = ctx.path ? `${ctx.path}.${fieldName}` : fieldName;
      const result = validator(value[fieldName], { ...ctx, path: fieldPath });

      if (!result.valid) {
        errors.push(...result.errors);
      }
      warnings.push(...result.warnings);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  };
}

/**
 * Compiles a string validator
 */
function compileStringValidator(check, context) {
  const { minLength, maxLength, pattern } = check;
  const regex = pattern ? new RegExp(pattern) : null;

  return function validateString(value, ctx = {}) {
    if (typeof value !== 'string') {
      return {
        valid: false,
        errors: [{
          code: 'string.expected',
          message: getMessage('string.expected', {
            field: ctx.path || 'value'
          }, ctx.locale),
          path: ctx.path || '',
          actual: typeof value
        }],
        warnings: []
      };
    }

    const errors = [];

    if (minLength !== undefined && value.length < minLength) {
      errors.push({
        code: 'string.tooShort',
        message: getMessage('string.tooShort', {
          field: ctx.path || 'value',
          length: value.length,
          min: minLength
        }, ctx.locale),
        path: ctx.path || ''
      });
    }

    if (maxLength !== undefined && value.length > maxLength) {
      errors.push({
        code: 'string.tooLong',
        message: getMessage('string.tooLong', {
          field: ctx.path || 'value',
          length: value.length,
          max: maxLength
        }, ctx.locale),
        path: ctx.path || ''
      });
    }

    if (regex && !regex.test(value)) {
      errors.push({
        code: 'string.patternMismatch',
        message: getMessage('string.patternMismatch', {
          field: ctx.path || 'value',
          pattern: String(pattern)
        }, ctx.locale),
        path: ctx.path || ''
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: []
    };
  };
}

/**
 * Compiles a custom validator function
 */
function compileCustomValidator(check, context) {
  const { fn } = check;

  if (typeof fn !== 'function') {
    throw new Error('Custom validator must provide a function');
  }

  return fn;
}

/**
 * Compiles a reference validator (delegates to another rule)
 */
function compileRefValidator(check, context) {
  const { ref } = check;
  const referencedRule = context.rules?.[ref];

  if (!referencedRule) {
    throw new Error(`Referenced rule not found: ${ref}`);
  }

  return compileRule(referencedRule, context);
}

// Placeholder compilers for remaining validator types
function compileNumberValidator(check, context) {
  const { min, max, integer = false } = check;

  return function validateNumber(value, ctx = {}) {
    if (typeof value !== 'number') {
      return {
        valid: false,
        errors: [{
          code: 'number.expected',
          message: getMessage('number.expected', {
            field: ctx.path || 'value'
          }, ctx.locale),
          path: ctx.path || '',
          actual: typeof value
        }],
        warnings: []
      };
    }

    const errors = [];

    if (integer && !Number.isInteger(value)) {
      errors.push({
        code: 'number.notInteger',
        message: getMessage('number.notInteger', {
          field: ctx.path || 'value',
          value: String(value)
        }, ctx.locale),
        path: ctx.path || ''
      });
    }

    if (min !== undefined && value < min) {
      errors.push({
        code: 'number.tooSmall',
        message: getMessage('number.tooSmall', {
          field: ctx.path || 'value',
          value: String(value),
          min: String(min)
        }, ctx.locale),
        path: ctx.path || ''
      });
    }

    if (max !== undefined && value > max) {
      errors.push({
        code: 'number.tooLarge',
        message: getMessage('number.tooLarge', {
          field: ctx.path || 'value',
          value: String(value),
          max: String(max)
        }, ctx.locale),
        path: ctx.path || ''
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: []
    };
  };
}

function compileBooleanValidator(check, context) {
  return function validateBoolean(value, ctx = {}) {
    if (typeof value !== 'boolean') {
      return {
        valid: false,
        errors: [{
          code: 'boolean.expected',
          message: getMessage('boolean.expected', {
            field: ctx.path || 'value'
          }, ctx.locale),
          path: ctx.path || '',
          actual: typeof value
        }],
        warnings: []
      };
    }
    return { valid: true, errors: [], warnings: [] };
  };
}

function compileMinLengthValidator(check, context) {
  const { min } = check;
  return function validateMinLength(value, ctx = {}) {
    const length = typeof value === 'string' ? value.length : Array.isArray(value) ? value.length : 0;
    if (length < min) {
      return {
        valid: false,
        errors: [{
          code: 'minLength.tooShort',
          message: getMessage('minLength.tooShort', {
            field: ctx.path || 'value',
            length: String(length),
            min: String(min)
          }, ctx.locale),
          path: ctx.path || ''
        }],
        warnings: []
      };
    }
    return { valid: true, errors: [], warnings: [] };
  };
}

function compileMaxLengthValidator(check, context) {
  const { max } = check;
  return function validateMaxLength(value, ctx = {}) {
    const length = typeof value === 'string' ? value.length : Array.isArray(value) ? value.length : 0;
    if (length > max) {
      return {
        valid: false,
        errors: [{
          code: 'maxLength.tooLong',
          message: getMessage('maxLength.tooLong', {
            field: ctx.path || 'value',
            length: String(length),
            max: String(max)
          }, ctx.locale),
          path: ctx.path || ''
        }],
        warnings: []
      };
    }
    return { valid: true, errors: [], warnings: [] };
  };
}

function compilePatternValidator(check, context) {
  const { pattern } = check;
  const regex = new RegExp(pattern);

  return function validatePattern(value, ctx = {}) {
    if (typeof value !== 'string' || !regex.test(value)) {
      return {
        valid: false,
        errors: [{
          code: 'pattern.mismatch',
          message: getMessage('pattern.mismatch', {
            field: ctx.path || 'value',
            pattern: String(pattern)
          }, ctx.locale),
          path: ctx.path || ''
        }],
        warnings: []
      };
    }
    return { valid: true, errors: [], warnings: [] };
  };
}

function compileMinValidator(check, context) {
  const { value } = check;
  return function validateMin(val, ctx = {}) {
    if (typeof val !== 'number' || val < value) {
      return {
        valid: false,
        errors: [{
          code: 'min.tooSmall',
          message: getMessage('min.tooSmall', {
            field: ctx.path || 'value',
            actual: String(val),
            min: String(value)
          }, ctx.locale),
          path: ctx.path || ''
        }],
        warnings: []
      };
    }
    return { valid: true, errors: [], warnings: [] };
  };
}

function compileMaxValidator(check, context) {
  const { value } = check;
  return function validateMax(val, ctx = {}) {
    if (typeof val !== 'number' || val > value) {
      return {
        valid: false,
        errors: [{
          code: 'max.tooLarge',
          message: getMessage('max.tooLarge', {
            field: ctx.path || 'value',
            actual: String(val),
            max: String(value)
          }, ctx.locale),
          path: ctx.path || ''
        }],
        warnings: []
      };
    }
    return { valid: true, errors: [], warnings: [] };
  };
}

function compileNoUnexpectedFieldsValidator(check, context) {
  const { allowed = [] } = check;
  const allowedSet = new Set(allowed);

  return function validateNoUnexpectedFields(value, ctx = {}) {
    if (typeof value !== 'object' || value === null) {
      return { valid: true, errors: [], warnings: [] };
    }

    const warnings = [];
    for (const key of Object.keys(value)) {
      if (!allowedSet.has(key)) {
        warnings.push({
          code: 'noUnexpectedFields.unexpected',
          message: getMessage('noUnexpectedFields.unexpected', {
            field: ctx.path || 'value',
            property: key
          }, ctx.locale),
          path: ctx.path ? `${ctx.path}.${key}` : key
        });
      }
    }

    return {
      valid: true,
      errors: [],
      warnings
    };
  };
}

/**
 * Clears the rule compilation cache
 */
export function clearRuleCache() {
  RULE_CACHE.clear();
}

// ============================================================================
// SECTION 5: Domain-Specific Validators
// ============================================================================

/**
 * Validates worker execution evidence
 * Implements checks from workflow-contract.json protocols.workerTaskPacket.workerExecutionEvidenceField
 *
 * @param {Object} evidence - Worker execution evidence array
 * @param {Object} contract - Workflow contract
 * @param {Object} options - Validation options
 * @returns {ValidationResult} Validation result
 */
export function validateWorkerExecutionEvidence(evidence, contract, options = {}) {
  const { locale = 'en-US' } = options;
  const errors = [];
  const warnings = [];

  if (!Array.isArray(evidence)) {
    return {
      valid: false,
      errors: [{
        code: 'workerExecutionEvidence.notArray',
        message: getMessage('workerExecutionEvidence.notArray', {}, locale),
        path: 'workerExecutionEvidence'
      }],
      warnings: []
    };
  }

  const policy = contract?.protocols?.workerTaskPacket?.workerExecutionEvidenceField;

  if (!policy) {
    warnings.push({
      code: 'workerExecutionEvidence.noPolicy',
      message: getMessage('workerExecutionEvidence.noPolicy', {}, locale),
      path: 'workerExecutionEvidence'
    });
  }

  // Validate each evidence entry
  const requiredFields = policy?._meta?.requiredFields || ['command', 'passClaim', 'status', 'runBy', 'runAt', 'successMarkerFormat'];

  for (const [index, entry] of evidence.entries()) {
    const entryPath = `workerExecutionEvidence[${index}]`;

    // Check required fields
    for (const field of requiredFields) {
      if (!(field in entry)) {
        errors.push({
          code: 'workerExecutionEvidence.missingField',
          message: getMessage('workerExecutionEvidence.missingField', {
            field,
            index: index + 1
          }, locale),
          path: `${entryPath}.${field}`
        });
      }
    }

    // Validate status enum
    const allowedStatuses = ['verified', 'fabricated', 'skipped'];
    if (entry.status && !allowedStatuses.includes(entry.status)) {
      errors.push({
        code: 'workerExecutionEvidence.invalidStatus',
        message: getMessage('workerExecutionEvidence.invalidStatus', {
          status: entry.status,
          allowed: allowedStatuses.join(', ')
        }, locale),
        path: `${entryPath}.status`
      });
    }

    // Block fabricated evidence
    if (entry.status === 'fabricated') {
      errors.push({
        code: 'workerExecutionEvidence.fabricated',
        message: getMessage('workerExecutionEvidence.fabricated', {
          command: entry.command || 'unknown'
        }, locale),
        path: entryPath
      });
    }

    // Validate successMarkerFormat
    const allowedFormats = ['stdout-text', 'exit-code-only', 'json-output'];
    if (entry.successMarkerFormat && !allowedFormats.includes(entry.successMarkerFormat)) {
      errors.push({
        code: 'workerExecutionEvidence.invalidFormat',
        message: getMessage('workerExecutionEvidence.invalidFormat', {
          format: entry.successMarkerFormat,
          allowed: allowedFormats.join(', ')
        }, locale),
        path: `${entryPath}.successMarkerFormat`
      });
    }

    // Validate exit-code-only requirements
    if (entry.successMarkerFormat === 'exit-code-only' && entry.status === 'verified') {
      if (entry.exitCode !== 0) {
        errors.push({
          code: 'workerExecutionEvidence.badExitCode',
          message: getMessage('workerExecutionEvidence.badExitCode', {
            exitCode: entry.exitCode
          }, locale),
          path: `${entryPath}.exitCode`
        });
      }
      if (!entry.commandRanAt) {
        errors.push({
          code: 'workerExecutionEvidence.missingTimestamp',
          message: getMessage('workerExecutionEvidence.missingTimestamp', {}, locale),
          path: `${entryPath}.commandRanAt`
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validates file completion list
 * Implements checks from workflow-contract.json protocols.workerTaskPacket.fileCompletionListField
 *
 * @param {Object[]} fileCompletionList - File completion list array
 * @param {Object} options - Validation options
 * @returns {ValidationResult} Validation result
 */
export function validateFileCompletionList(fileCompletionList, options = {}) {
  const { locale = 'en-US', promisedPaths = [] } = options;
  const errors = [];
  const warnings = [];

  if (!Array.isArray(fileCompletionList)) {
    return {
      valid: false,
      errors: [{
        code: 'fileCompletionList.notArray',
        message: getMessage('fileCompletionList.notArray', {}, locale),
        path: 'fileCompletionList'
      }],
      warnings: []
    };
  }

  const completedPaths = new Set();
  const requiredFields = ['path', 'action', 'status'];
  const allowedActions = ['edit', 'create', 'delete', 'rename'];
  const allowedStatuses = ['completed', 'skipped', 'failed'];

  for (const [index, entry] of fileCompletionList.entries()) {
    const entryPath = `fileCompletionList[${index}]`;

    // Check required fields
    for (const field of requiredFields) {
      if (!(field in entry)) {
        errors.push({
          code: 'fileCompletionList.missingField',
          message: getMessage('fileCompletionList.missingField', {
            field,
            index: index + 1
          }, locale),
          path: `${entryPath}.${field}`
        });
      }
    }

    // Validate action
    if (entry.action && !allowedActions.includes(entry.action)) {
      errors.push({
        code: 'fileCompletionList.invalidAction',
        message: getMessage('fileCompletionList.invalidAction', {
          action: entry.action,
          allowed: allowedActions.join(', ')
        }, locale),
        path: `${entryPath}.action`
      });
    }

    // Validate status
    if (entry.status && !allowedStatuses.includes(entry.status)) {
      errors.push({
        code: 'fileCompletionList.invalidStatus',
        message: getMessage('fileCompletionList.invalidStatus', {
          status: entry.status,
          allowed: allowedStatuses.join(', ')
        }, locale),
        path: `${entryPath}.status`
      });
    }

    // Require skipReason for non-completed status
    if (entry.status !== 'completed' && !entry.skipReason) {
      errors.push({
        code: 'fileCompletionList.missingSkipReason',
        message: getMessage('fileCompletionList.missingSkipReason', {
          path: entry.path
        }, locale),
        path: `${entryPath}.skipReason`
      });
    }

    // Track completed paths
    if (entry.path) {
      completedPaths.add(entry.path.replace(/\\/g, '/').toLowerCase());
    }
  }

  // Check that all promised paths are accounted for
  for (const promisedPath of promisedPaths) {
    const normalized = promisedPath.replace(/\\/g, '/').toLowerCase();
    if (!completedPaths.has(normalized)) {
      warnings.push({
        code: 'fileCompletionList.unaccountedPath',
        message: getMessage('fileCompletionList.unaccountedPath', {
          path: promisedPath
        }, locale),
        path: 'fileCompletionList'
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validates task classification
 * Implements checks from workflow-contract.json protocols.taskClassification
 *
 * @param {Object} taskClassification - Task classification object
 * @param {Object} contract - Workflow contract
 * @param {Object} options - Validation options
 * @returns {ValidationResult} Validation result
 */
export function validateTaskClassification(taskClassification, contract, options = {}) {
  const { locale = 'en-US' } = options;
  const errors = [];
  const warnings = [];

  if (!taskClassification || typeof taskClassification !== 'object') {
    return {
      valid: false,
      errors: [{
        code: 'taskClassification.missing',
        message: getMessage('taskClassification.missing', {}, locale),
        path: 'taskClassification'
      }],
      warnings: []
    };
  }

  const policy = contract?.runDiscipline?.taskClassification;
  const requiredFields = contract?.protocols?.taskClassification?.requiredFields || [];

  // Check required fields
  for (const field of requiredFields) {
    if (!(field in taskClassification)) {
      errors.push({
        code: 'taskClassification.missingField',
        message: getMessage('taskClassification.missingField', {
          field
        }, locale),
        path: `taskClassification.${field}`
      });
    }
  }

  // Validate taskClass enum
  if (taskClassification.taskClass) {
    const allowedTaskClasses = policy?.taskClassEnum || ['Q', 'A', 'P', 'S'];
    if (!allowedTaskClasses.includes(taskClassification.taskClass)) {
      errors.push({
        code: 'taskClassification.invalidTaskClass',
        message: getMessage('taskClassification.invalidTaskClass', {
          taskClass: taskClassification.taskClass,
          allowed: allowedTaskClasses.join(', ')
        }, locale),
        path: 'taskClassification.taskClass'
      });
    }
  }

  // Validate governanceFlow enum
  if (taskClassification.governanceFlow) {
    const allowedFlows = policy?.governanceFlowEnum || [
      'query', 'simple_exec', 'complex_dev', 'meta_analysis',
      'proposal_review', 'rhythm'
    ];
    if (!allowedFlows.includes(taskClassification.governanceFlow)) {
      errors.push({
        code: 'taskClassification.invalidFlow',
        message: getMessage('taskClassification.invalidFlow', {
          flow: taskClassification.governanceFlow,
          allowed: allowedFlows.join(', ')
        }, locale),
        path: 'taskClassification.governanceFlow'
      });
    }
  }

  // Validate triggerReasons
  if (Array.isArray(taskClassification.triggerReasons)) {
    const allowedTriggers = policy?.triggerReasonEnum || [];
    for (const [index, trigger] of taskClassification.triggerReasons.entries()) {
      if (!allowedTriggers.includes(trigger)) {
        errors.push({
          code: 'taskClassification.invalidTrigger',
          message: getMessage('taskClassification.invalidTrigger', {
            trigger,
            allowed: allowedTriggers.join(', ')
          }, locale),
          path: `taskClassification.triggerReasons[${index}]`
        });
      }
    }
  }

  // Validate ownerRequired=false constraint
  if (taskClassification.ownerRequired === false) {
    const isValidQueryCase =
      taskClassification.taskClass === 'Q' &&
      taskClassification.requestClass === 'query' &&
      taskClassification.governanceFlow === 'query' &&
      taskClassification.bypassReasons?.includes('pure_query');

    if (!isValidQueryCase) {
      errors.push({
        code: 'taskClassification.illegalOwnerNotRequired',
        message: getMessage('taskClassification.illegalOwnerNotRequired', {}, locale),
        path: 'taskClassification.ownerRequired'
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

// ============================================================================
// SECTION 6: Main Validator Engine API
// ============================================================================

/**
 * Main validator engine class
 * Provides high-level API for contract-based validation
 */
export class ValidatorEngine {
  #contracts = new Map();
  #locale = 'en-US';
  #cacheEnabled = true;

  constructor(options = {}) {
    this.#locale = options.locale || 'en-US';
    this.#cacheEnabled = options.cacheEnabled !== false;
  }

  /**
   * Loads a contract by name or path
   */
  async loadContract(nameOrPath) {
    const contract = await loadValidationContract(nameOrPath, {
      useCache: this.#cacheEnabled
    });
    this.#contracts.set(nameOrPath, contract);
    return contract;
  }

  /**
   * Gets a loaded contract
   */
  getContract(name) {
    return this.#contracts.get(name);
  }

  /**
   * Validates worker execution evidence against loaded contracts
   */
  validateWorkerEvidence(evidence) {
    const contract = this.#contracts.get('workflow');
    return validateWorkerExecutionEvidence(evidence, contract, {
      locale: this.#locale
    });
  }

  /**
   * Validates file completion list
   */
  validateFileCompletion(list, options) {
    return validateFileCompletionList(list, {
      locale: this.#locale,
      ...options
    });
  }

  /**
   * Validates task classification
   */
  validateTaskClassification(taskClassification) {
    const contract = this.#contracts.get('workflow');
    return validateTaskClassification(taskClassification, contract, {
      locale: this.#locale
    });
  }

  /**
   * Sets the validation locale
   */
  setLocale(locale) {
    this.#locale = locale;
    return this;
  }

  /**
   * Gets the current locale
   */
  getLocale() {
    return this.#locale;
  }

  /**
   * Clears all caches
   */
  clearCache() {
    clearContractCache();
    clearRuleCache();
    return this;
  }
}

/**
 * Creates a pre-configured validator engine
 *
 * @param {Object} options - Configuration options
 * @returns {ValidatorEngine} Configured engine
 */
export function createValidatorEngine(options = {}) {
  return new ValidatorEngine(options);
}

// ============================================================================
// SECTION 7: Default Message Registry
// ============================================================================

/**
 * Register default error messages
 * These can be overridden by loading from contracts
 */
export function registerDefaultMessages() {
  registerMessages('type.mismatch', {
    'en-US': 'Field {{field}} must be {{expected}}, got: {{actual}}',
    'zh-CN': '字段 {{field}} 必须是 {{expected}}，实际为: {{actual}}'
  });

  registerMessages('enum.invalid', {
    'en-US': 'Field {{field}} must be one of {{allowed}}, got: {{value}}',
    'zh-CN': '字段 {{field}} 必须是 {{allowed}} 之一，实际为: {{value}}'
  });

  registerMessages('array.expected', {
    'en-US': 'Field {{field}} must be an array',
    'zh-CN': '字段 {{field}} 必须是数组'
  });

  registerMessages('array.tooShort', {
    'en-US': 'Array {{field}} must have at least {{min}} items, got: {{length}}',
    'zh-CN': '数组 {{field}} 至少需要 {{min}} 项，实际为: {{length}}'
  });

  registerMessages('array.tooLong', {
    'en-US': 'Array {{field}} must have at most {{max}} items, got: {{length}}',
    'zh-CN': '数组 {{field}} 最多允许 {{max}} 项，实际为: {{length}}'
  });

  registerMessages('object.expected', {
    'en-US': 'Field {{field}} must be an object',
    'zh-CN': '字段 {{field}} 必须是对象'
  });

  registerMessages('required.missing', {
    'en-US': 'Missing required field: {{field}}',
    'zh-CN': '缺少必填字段: {{field}}'
  });

  registerMessages('required.notObject', {
    'en-US': 'Field {{field}} must be an object to check required fields',
    'zh-CN': '字段 {{field}} 必须是对象以检查必填字段'
  });

  registerMessages('fields.missing', {
    'en-US': 'Missing required field: {{field}}',
    'zh-CN': '缺少必填字段: {{field}}'
  });

  registerMessages('fields.notObject', {
    'en-US': 'Field {{field}} must be an object to validate fields',
    'zh-CN': '字段 {{field}} 必须是对象以验证字段'
  });

  registerMessages('string.expected', {
    'en-US': 'Field {{field}} must be a string',
    'zh-CN': '字段 {{field}} 必须是字符串'
  });

  registerMessages('string.tooShort', {
    'en-US': 'String {{field}} must be at least {{min}} characters, got: {{length}}',
    'zh-CN': '字符串 {{field}} 至少需要 {{min}} 个字符，实际为: {{length}}'
  });

  registerMessages('string.tooLong', {
    'en-US': 'String {{field}} must be at most {{max}} characters, got: {{length}}',
    'zh-CN': '字符串 {{field}} 最多允许 {{max}} 个字符，实际为: {{length}}'
  });

  registerMessages('string.patternMismatch', {
    'en-US': 'String {{field}} must match pattern {{pattern}}',
    'zh-CN': '字符串 {{field}} 必须匹配模式 {{pattern}}'
  });

  registerMessages('object.unexpectedProperty', {
    'en-US': 'Unexpected property {{property}} in {{field}}',
    'zh-CN': '字段 {{field}} 中存在意外属性 {{property}}'
  });

  // Worker execution evidence messages
  registerMessages('workerExecutionEvidence.notArray', {
    'en-US': 'workerExecutionEvidence must be an array',
    'zh-CN': 'workerExecutionEvidence 必须是数组'
  });

  registerMessages('workerExecutionEvidence.noPolicy', {
    'en-US': 'No validation policy found for workerExecutionEvidence',
    'zh-CN': '未找到 workerExecutionEvidence 的验证策略'
  });

  registerMessages('workerExecutionEvidence.missingField', {
    'en-US': 'workerExecutionEvidence entry {{index}} missing required field: {{field}}',
    'zh-CN': 'workerExecutionEvidence 条目 {{index}} 缺少必填字段: {{field}}'
  });

  registerMessages('workerExecutionEvidence.invalidStatus', {
    'en-US': 'Invalid status: {{status}}. Must be one of: {{allowed}}',
    'zh-CN': '无效状态: {{status}}。必须是以下之一: {{allowed}}'
  });

  registerMessages('workerExecutionEvidence.fabricated', {
    'en-US': 'Verification evidence fabricated for command: {{command}}',
    'zh-CN': '命令 {{command}} 的验证证据是伪造的'
  });

  registerMessages('workerExecutionEvidence.invalidFormat', {
    'en-US': 'Invalid successMarkerFormat: {{format}}. Must be one of: {{allowed}}',
    'zh-CN': '无效的 successMarkerFormat: {{format}}。必须是以下之一: {{allowed}}'
  });

  registerMessages('workerExecutionEvidence.badExitCode', {
    'en-US': 'exit-code-only evidence requires exitCode=0, got: {{exitCode}}',
    'zh-CN': 'exit-code-only 证据需要 exitCode=0，实际为: {{exitCode}}'
  });

  registerMessages('workerExecutionEvidence.missingTimestamp', {
    'en-US': 'exit-code-only evidence requires commandRanAt timestamp',
    'zh-CN': 'exit-code-only 证据需要 commandRanAt 时间戳'
  });

  // File completion list messages
  registerMessages('fileCompletionList.notArray', {
    'en-US': 'fileCompletionList must be an array',
    'zh-CN': 'fileCompletionList 必须是数组'
  });

  registerMessages('fileCompletionList.missingField', {
    'en-US': 'fileCompletionList entry {{index}} missing required field: {{field}}',
    'zh-CN': 'fileCompletionList 条目 {{index}} 缺少必填字段: {{field}}'
  });

  registerMessages('fileCompletionList.invalidAction', {
    'en-US': 'Invalid action: {{action}}. Must be one of: {{allowed}}',
    'zh-CN': '无效操作: {{action}}。必须是以下之一: {{allowed}}'
  });

  registerMessages('fileCompletionList.invalidStatus', {
    'en-US': 'Invalid status: {{status}}. Must be one of: {{allowed}}',
    'zh-CN': '无效状态: {{status}}。必须是以下之一: {{allowed}}'
  });

  registerMessages('fileCompletionList.missingSkipReason', {
    'en-US': 'skipReason required for {{path}} when status is not "completed"',
    'zh-CN': '当状态不是 "completed" 时，{{path}} 需要提供 skipReason'
  });

  registerMessages('fileCompletionList.unaccountedPath', {
    'en-US': 'Promised path not accounted for in fileCompletionList: {{path}}',
    'zh-CN': '承诺的路径未在 fileCompletionList 中说明: {{path}}'
  });

  // Task classification messages
  registerMessages('taskClassification.missing', {
    'en-US': 'taskClassification object is missing',
    'zh-CN': '缺少 taskClassification 对象'
  });

  registerMessages('taskClassification.missingField', {
    'en-US': 'taskClassification missing required field: {{field}}',
    'zh-CN': 'taskClassification 缺少必填字段: {{field}}'
  });

  registerMessages('taskClassification.invalidTaskClass', {
    'en-US': 'Invalid taskClass: {{taskClass}}. Must be one of: {{allowed}}',
    'zh-CN': '无效的 taskClass: {{taskClass}}。必须是以下之一: {{allowed}}'
  });

  registerMessages('taskClassification.invalidFlow', {
    'en-US': 'Invalid governanceFlow: {{flow}}. Must be one of: {{allowed}}',
    'zh-CN': '无效的 governanceFlow: {{flow}}。必须是以下之一: {{allowed}}'
  });

  registerMessages('taskClassification.invalidTrigger', {
    'en-US': 'Invalid triggerReason: {{trigger}}. Must be one of: {{allowed}}',
    'zh-CN': '无效的 triggerReason: {{trigger}}。必须是以下之一: {{allowed}}'
  });

  registerMessages('taskClassification.illegalOwnerNotRequired', {
    'en-US': 'ownerRequired=false is only legal for pure-query runs',
    'zh-CN': 'ownerRequired=false 仅对纯查询运行合法'
  });
}

// Initialize default messages on module load
registerDefaultMessages();
