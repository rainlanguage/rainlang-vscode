import path from "path";
import { runTests } from "@vscode/test-electron";

(async function main() {
    try {
        // The folder containing the Extension Manifest package.json
        // Passed to `--extensionDevelopmentPath`
        const extensionDevelopmentPath = path.resolve(__dirname, "../../..");

        // The path to test runner
        // Passed to --extensionTestsPath
        const extensionTestsPath = path.resolve(__dirname, "index");

        // Path to workspace to be opened
        // Passed as 'args'
        const workspacePath = path.resolve(__dirname, "../../test-workspace");

        // Download VS Code, unzip it and run the integration test
        await runTests({ 
            extensionDevelopmentPath, 
            extensionTestsPath, 
            launchArgs: [ workspacePath ],
            version: "stable"
        });
    } 
    catch (err) {
        console.error("Failed to run tests");
        process.exit(1);
    }
})();

