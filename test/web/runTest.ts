import path from "path";
import { runTests } from "@vscode/test-web";

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
        const folderPath = path.resolve(__dirname, "../../fixtures");

        // Start a web server that serves VSCode in a browser, run the tests
        await runTests({
            browserType: "chromium",
            headless: true,  // do not open the browser page
            extensionDevelopmentPath,
            extensionTestsPath,
            folderPath,
            // printServerLog: false
        });
    } 
    catch (err) {
        console.error("Failed to run tests");
        process.exit(1);
    }
})();
