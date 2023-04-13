// imports mocha for the browser, defining the `mocha` global.
require("mocha/mocha");

export function run(): Promise<void> {
    return new Promise((resolve, reject) => {
        mocha.setup({
            ui: "tdd",
            reporter: undefined,
            timeout: 100000
        });

        // bundles all the test files in the ./test/out directory matching `*.test`
        const importAll = (r: __WebpackModuleApi.RequireContext) => r.keys().forEach(r);
        importAll(require.context("..", false, /\.test$/));

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
}