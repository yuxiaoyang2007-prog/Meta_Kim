import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  detectPython310,
  extractPipShowVersion,
  formatPythonLauncher,
  runPythonModule,
  meetsMinimumVersion,
  checkNetworkx,
  ensurePip,
  discoverWindowsPythonPathCommands,
} from "../../scripts/graphify-runtime.mjs";

describe("detectPython310()", () => {
  test("detects python when version is printed to stderr", () => {
    const python = detectPython310((command) => {
      if (command === "python3") {
        return {
          status: 0,
          stdout: "",
          stderr: "Python 3.11.7",
        };
      }
      return {
        status: 1,
        stdout: "",
        stderr: "",
        error: new Error("not found"),
      };
    }, "linux");

    assert.equal(python.command, "python3");
    assert.equal(python.version.major, 3);
    assert.equal(python.version.minor, 11);
  });

  test("prefers py -3 on Windows when available", () => {
    const calls = [];
    const python = detectPython310((command, args) => {
      calls.push([command, args]);
      if (command === "py") {
        return {
          status: 0,
          stdout: "Python 3.12.1",
          stderr: "",
        };
      }
      return {
        status: 1,
        stdout: "",
        stderr: "",
        error: new Error("not found"),
      };
    }, "win32");

    assert.equal(python.command, "py");
    assert.deepEqual(python.args, ["-3"]);
    assert.deepEqual(calls[0], ["py", ["-3", "--version"]]);
  });

  test("skips a version-compatible interpreter when pip is unavailable", () => {
    const python = detectPython310((command, args) => {
      const joined = args.join(" ");
      if (joined === "-m pip --version") {
        return {
          status: command === "python" ? 0 : 1,
          stdout: command === "python" ? "pip 24.0" : "",
          stderr: command === "python" ? "" : "No module named pip",
        };
      }
      if (joined === "--version") {
        return {
          status: 0,
          stdout: command === "python3" ? "Python 3.11.7" : "Python 3.12.1",
          stderr: "",
        };
      }
      return { status: 1, stdout: "", stderr: "" };
    }, "linux", { requirePip: true });

    assert.equal(python.command, "python");
    assert.equal(python.version.minor, 12);
  });

  test("can bootstrap missing pip with ensurepip before selecting Python", () => {
    let pipChecks = 0;
    const python = detectPython310((command, args) => {
      assert.equal(command, "python3");
      const joined = args.join(" ");
      if (joined === "--version") {
        return { status: 0, stdout: "Python 3.11.7", stderr: "" };
      }
      if (joined === "-m pip --version") {
        pipChecks += 1;
        return pipChecks === 1
          ? { status: 1, stdout: "", stderr: "No module named pip" }
          : { status: 0, stdout: "pip 24.0", stderr: "" };
      }
      if (joined === "-m ensurepip --upgrade") {
        return { status: 0, stdout: "Successfully installed pip", stderr: "" };
      }
      return { status: 1, stdout: "", stderr: "" };
    }, "linux", { requirePip: true, bootstrapPip: true });

    assert.equal(python.command, "python3");
    assert.equal(python.pipBootstrapped, true);
  });
});

describe("runPythonModule()", () => {
  test("reuses the same interpreter for pip installs", () => {
    const calls = [];
    runPythonModule(
      { command: "py", args: ["-3"] },
      ["-m", "pip", "install", "graphifyy"],
      (command, args, options) => {
        calls.push({ command, args, options });
        return { status: 0, stdout: "", stderr: "" };
      },
    );

    assert.deepEqual(calls[0], {
      command: "py",
      args: ["-3", "-m", "pip", "install", "graphifyy"],
      options: {
        encoding: "utf8",
        shell: false,
      },
    });
  });
});

describe("graphify helpers", () => {
  test("extractPipShowVersion reads version from pip show output", () => {
    assert.equal(
      extractPipShowVersion("Name: graphifyy\nVersion: 1.2.3\nSummary: test"),
      "1.2.3",
    );
  });

  test("formatPythonLauncher renders launcher arguments", () => {
    assert.equal(
      formatPythonLauncher({ command: "py", args: ["-3"] }),
      "py -3",
    );
  });
});

describe("discoverWindowsPythonPathCommands()", () => {
  test("reads all python.exe entries from PATH instead of only the first", () => {
    const commands = discoverWindowsPythonPathCommands((command, args) => {
      assert.equal(command, "where.exe");
      if (args[0] === "python") {
        return {
          status: 0,
          stdout:
            "C:\\repo\\.venv\\Scripts\\python.exe\r\nC:\\Python312\\python.exe\r\n",
          stderr: "",
        };
      }
      return { status: 1, stdout: "", stderr: "" };
    });

    assert.deepEqual(commands, [
      { command: "C:\\repo\\.venv\\Scripts\\python.exe", args: [] },
      { command: "C:\\Python312\\python.exe", args: [] },
    ]);
  });
});

describe("ensurePip()", () => {
  test("uses ensurepip when pip is missing", () => {
    const calls = [];
    let pipChecks = 0;
    const result = ensurePip({ command: "python", args: [] }, (command, args) => {
      calls.push([command, args]);
      if (args.join(" ") === "-m pip --version") {
        pipChecks += 1;
        return pipChecks === 1
          ? { status: 1, stdout: "", stderr: "No module named pip" }
          : { status: 0, stdout: "pip 24.0", stderr: "" };
      }
      if (args.join(" ") === "-m ensurepip --upgrade") {
        return { status: 0, stdout: "ok", stderr: "" };
      }
      return { status: 1, stdout: "", stderr: "" };
    });

    assert.equal(result.ok, true);
    assert.equal(result.bootstrapped, true);
    assert.deepEqual(calls.map((call) => call[1]), [
      ["-m", "pip", "--version"],
      ["-m", "ensurepip", "--upgrade"],
      ["-m", "pip", "--version"],
    ]);
  });
});

describe("meetsMinimumVersion()", () => {
  test("returns true when version meets minimum", () => {
    assert.equal(meetsMinimumVersion("3.6.1", 3, 4), true);
    assert.equal(meetsMinimumVersion("3.4.0", 3, 4), true);
    assert.equal(meetsMinimumVersion("4.0.0", 3, 4), true);
  });

  test("returns false when version is below minimum", () => {
    assert.equal(meetsMinimumVersion("3.1.0", 3, 4), false);
    assert.equal(meetsMinimumVersion("3.3.9", 3, 4), false);
    assert.equal(meetsMinimumVersion("2.9.1", 3, 4), false);
  });

  test("returns false for unparseable input", () => {
    assert.equal(meetsMinimumVersion("unknown", 3, 4), false);
    assert.equal(meetsMinimumVersion("", 3, 4), false);
  });
});

describe("checkNetworkx()", () => {
  const python = { command: "python", args: [] };

  test("detects compatible networkx", () => {
    const result = checkNetworkx(python, () => ({
      status: 0,
      stdout: "Name: networkx\nVersion: 3.6.1\nSummary: test",
      stderr: "",
    }));
    assert.equal(result.installed, true);
    assert.equal(result.version, "3.6.1");
    assert.equal(result.meets, true);
  });

  test("detects incompatible networkx", () => {
    const result = checkNetworkx(python, () => ({
      status: 0,
      stdout: "Name: networkx\nVersion: 3.1\nSummary: test",
      stderr: "",
    }));
    assert.equal(result.installed, true);
    assert.equal(result.version, "3.1");
    assert.equal(result.meets, false);
  });

  test("handles missing networkx", () => {
    const result = checkNetworkx(python, () => ({
      status: 1,
      stdout: "",
      stderr: "WARNING: Package(s) not found: networkx",
    }));
    assert.equal(result.installed, false);
    assert.equal(result.meets, false);
  });
});
