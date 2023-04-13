import * as path from "path";
import Mocha from "mocha";
import glob from "glob";

export function run(): Promise<void> {
    // path to tests
    const testsRoot = path.resolve(__dirname, "..");

    // Create the mocha test
    const mocha = new Mocha({
        ui: "tdd",
        color: true,
        timeout: 1000000
    });

    return new Promise((resolve, reject) => {
        glob("**.test.js", { cwd: testsRoot }, (err, files) => {
            if (err) return reject(err);

            // Add files to the test suite
            files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

            try {
                // Run the mocha test
                mocha.run(failures => {
                    if (failures === 1) reject(new Error("1 test failed!"));
                    else if (failures > 1) reject(new Error(`${failures} tests failed!`));
                    else resolve();
                });
            } 
            catch (err) {
                console.error(err);
                reject(err);
            }
        });
    });
}