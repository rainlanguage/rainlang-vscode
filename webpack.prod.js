/* eslint-disable @typescript-eslint/no-var-requires */
//@ts-check
"use strict";

//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

const path = require("path");
const webpack = require("webpack");
const TerserPlugin = require("terser-webpack-plugin");

/** @type WebpackConfig */
const client = {
    context: path.join(__dirname, "client"),
    mode: "none",
    target: "webworker", // web extensions run in a webworker context
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
        extensions: [".ts", ".js"], // support ts-files and js-files
        alias: {},
        fallback: {
            path: require.resolve("path-browserify")
        },
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
    externals: {
        vscode: "commonjs vscode", // ignored because it doesn't exist
    },
    performance: {
        hints: false,
    },
    optimization: {
        minimize: true,
        minimizer: [new TerserPlugin({
            extractComments: false,
        })],
    }
};

/** @type WebpackConfig */
const server = {
    context: path.join(__dirname, "server"),
    mode: "none",
    target: "webworker", // web extensions run in a webworker context
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
        extensions: [".ts", ".js"], // support ts-files and js-files
        alias: {},
        fallback: {},
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
    optimization: {
        minimize: true,
        minimizer: [new TerserPlugin({
            extractComments: false,
        })],
    }
};

module.exports = [client, server];