/* eslint-disable @typescript-eslint/no-var-requires */
//@ts-check
"use strict";

//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

const path = require("path");
const webpack = require("webpack");
const TerserPlugin = require("terser-webpack-plugin");
const nodeExternals = require("webpack-node-externals");

/** desktop extension config */
const node = (prod) => {
    /** @type WebpackConfig */
    const client = {
        context: path.join(__dirname, "client"),
        mode: prod ? "production" : "none",
        target: "node",
        entry: {
            nodeClientMain: "./src/nodeClient.ts",
        },
        output: {
            filename: "client.js",
            path: path.join(__dirname, "dist", "node"),
            libraryTarget: "commonjs"
        },
        resolve: {
            mainFields: ["module", "main"],
            extensions: [".ts", ".js"]
        },
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    exclude: /node_modules/,
                    use: [
                        {
                            loader: "ts-loader",
                        },
                    ],
                },
            ],
        },
        externals: [
            { vscode: "commonjs vscode" }, // ignored because it doesn't exist
            nodeExternals()
        ],
        performance: {
            hints: false,
        },
        devtool: "source-map",
    };

    /** @type WebpackConfig */
    const server = {
        context: path.join(__dirname, "server"),
        mode: prod ? "production" : "none",
        target: "node",
        entry: {
            nodeServerMain: "./src/nodeServer.ts",
        },
        output: {
            filename: "server.js",
            path: path.join(__dirname, "dist", "node"),
            libraryTarget: "commonjs"
        },
        resolve: {
            mainFields: ["module", "main"],
            extensions: [".ts", ".js"],
            alias: {
                "@rainprotocol/rainlang": "@rainprotocol/rainlang/cjs"
            },
            // fallback: {
            //     path: require.resolve("path-browserify")
            // },
        },
        // plugins: [
        //     new webpack.ProvidePlugin({
        //         process: "process/browser.js",
        //         Buffer: ["buffer", "Buffer"],
        //     })
        // ],
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    exclude: /node_modules/,
                    use: [
                        {
                            loader: "ts-loader",
                        },
                    ],
                },
            ],
        },
        externals: [
            { vscode: "commonjs vscode" }, // ignored because it doesn't exist
            nodeExternals()
        ],
        performance: {
            hints: false,
        },
        devtool: "source-map",
    };

    if (prod) {
        client.optimization = {
            minimize: true,
            minimizer: [new TerserPlugin({
                extractComments: false,
            })],
        };
        server.optimization = {
            minimize: true,
            minimizer: [new TerserPlugin({
                extractComments: false,
            })],
        };
        delete client.devtool;
        delete server.devtool;
    }
    return [ client, server ];
};

/** web extension config */
const browser = (prod) => {
    /** @type WebpackConfig */
    const client = {
        context: path.join(__dirname, "client"),
        mode: prod ? "production" : "none",
        target: "webworker",
        entry: {
            browserClientMain: "./src/browserClient.ts",
        },
        output: {
            filename: "client.js",
            path: path.join(__dirname, "dist", "browser"),
            libraryTarget: "commonjs"
        },
        resolve: {
            mainFields: ["browser", "module", "main"],
            extensions: [".ts", ".js"],
            alias: {},
            fallback: {
                path: require.resolve("path-browserify")
            },
        },
        plugins: [
            new webpack.ProvidePlugin({
                process: "process/browser.js",
                Buffer: ["buffer", "Buffer"],
            })
        ],
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    exclude: /node_modules/,
                    use: [
                        {
                            loader: "ts-loader",
                        },
                    ],
                },
            ],
        },
        externals: {
            vscode: "commonjs vscode", // ignored because it doesn't exist
        },
        performance: {
            hints: false,
        },
        devtool: "source-map",
    };

    /** @type WebpackConfig */
    const server = {
        context: path.join(__dirname, "server"),
        mode: prod ? "production" : "none",
        target: "webworker",
        entry: {
            browserServerMain: "./src/browserServer.ts",
        },
        output: {
            filename: "server.js",
            path: path.join(__dirname, "dist", "browser"),
            libraryTarget: "var",
            library: "serverExportVar",
        },
        resolve: {
            mainFields: ["browser", "module", "main"],
            extensions: [".ts", ".js", ".json"],
            alias: {
                "@rainprotocol/rainlang": "@rainprotocol/rainlang/cjs"
            },
            fallback: {
                process: require.resolve("process/browser")
            },
        },
        plugins: [
            new webpack.ProvidePlugin({
                process: "process/browser.js",
                Buffer: ["buffer", "Buffer"],
            })
        ],
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    exclude: /node_modules/,
                    use: [{
                        loader: "ts-loader",
                        // options: {
                        //     compilerOptions: {
                        //         "module": "es2022" // override `tsconfig.json` so that TypeScript emits native JavaScript modules.
                        //     },
                        //     type: "module"
                        // }
                    }]
                },
            ],
        },
        externals: {
            vscode: "commonjs vscode", // ignored because it doesn't exist
        },
        performance: {
            hints: false,
        },
        devtool: "source-map",
    };

    if (prod) {
        client.optimization = {
            minimize: true,
            minimizer: [new TerserPlugin({
                extractComments: false,
            })],
        };
        server.optimization = {
            minimize: true,
            minimizer: [new TerserPlugin({
                extractComments: false,
            })],
        };
        delete client.devtool;
        delete server.devtool;
    }
    return [ client, server ];
};

module.exports = (env) => {
    console.log(
        "\x1b[36m%s\x1b[0m",
        "compiling for " + 
        ( env.browser ? "browser " : "desktop " ) + 
        ( env.production ? "production" : "development" ) +
        "...",
        "\n"
    );
    return env.browser ? browser(env.production) : node(env.production);
};