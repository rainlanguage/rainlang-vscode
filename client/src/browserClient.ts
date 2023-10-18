import * as vscode from "vscode";
import { format } from "prettier/standalone";
import babelParser from "prettier/parser-babel";
import { LanguageClient, LanguageClientOptions } from "vscode-languageclient/browser";


let client: LanguageClient;
const defaultConfigPath = "./config.rain.json";

// this method is called when vs code is activated
export async function activate(context: vscode.ExtensionContext) {
    
    // config file URI
    let configUri: vscode.Uri;

    // workspace root URI
    let workspaceRootUri: vscode.Uri;

    // directories to check for rain documents, default is "src"
    let dirs: vscode.Uri[] = [];

    // auto compile mappings
    const compile = { onSave: [] };

    // channel for rainlang compiler
    let rainlangCompilerChannel: vscode.OutputChannel;

    // get the initial settings and pass them as initialzeOptions to server
    const initSettings = vscode.workspace.getConfiguration("rainlang");

    // setting the config file and init configs
    const configPath = initSettings.config
        ? initSettings.config as string 
        : defaultConfigPath;

    // setup the config file on config change
    vscode.workspace.onDidChangeConfiguration(async(e) => {
        if (e.affectsConfiguration("rainlang.config")) {
            try {
                const newConfig: any = {};
                const newPath = vscode.workspace.getConfiguration("rainlang").config;
                const newConfigPath = newPath && typeof newPath === "string" 
                    ? newPath 
                    : defaultConfigPath;
                configUri = vscode.Uri.joinPath(
                    workspaceRootUri, 
                    newConfigPath
                );
                const content = JSON.parse(
                    uint8ArrayToString(
                        await vscode.workspace.fs.readFile(configUri)
                    )
                );
                if (content?.compile?.onSave?.length > 0) {
                    compile.onSave = content.compile.onSave.map((v: any) => ({
                        input: vscode.Uri.joinPath(
                            workspaceRootUri, 
                            v.input
                        ),
                        output: vscode.Uri.joinPath(
                            workspaceRootUri, 
                            v.output
                        ),
                        entrypoints: v.entrypoints
                    }));
                }
                if (content.meta) newConfig.meta = content.meta;
                if (content.subgraphs) newConfig.subgraphs = content.subgraphs;
                client.sendNotification("update-config", JSON.stringify(newConfig));

                // find .rains on startup and send them to server for storing in meta store
                const newDirs: vscode.Uri[] = [];
                if (content.dirs && Array.isArray(content.dirs) && content.dirs.length > 0) {
                    for (let i = 0; i < content.dirs.length; i++) {
                        const dir = vscode.Uri.joinPath(workspaceRootUri, content.dirs[i]);
                        newDirs.push(dir);
                        if (!dirs.find(v => v.toString() === dir.toString())) {
                            vscode.workspace.findFiles(
                                new vscode.RelativePattern(newDirs[newDirs.length - 1], "**/*.rain"), 
                                "**​/node_modules/**"
                            ).then(
                                v => v.forEach(doc => vscode.workspace.openTextDocument(doc)),
                                () => { /**/ }
                            );
                        }
                    }
                }
                else {
                    const dir = vscode.Uri.joinPath(workspaceRootUri, "./src");
                    newDirs.push(dir);
                    if (!dirs.find(v => v.toString() === dir.toString())) {
                        vscode.workspace.findFiles(
                            new vscode.RelativePattern(newDirs[newDirs.length - 1], "**/*.rain"), 
                            "**​/node_modules/**"
                        ).then(
                            v => v.forEach(doc => vscode.workspace.openTextDocument(doc)),
                            () => { /**/ }
                        );
                    }
                }
                dirs = newDirs;
            }
            catch {
                vscode.window.showErrorMessage(
                    "Cannot find or read the config file"
                );
                compile.onSave = [];
                dirs = [];
            }
        }
    });

    // auto compile on save implementation
    vscode.workspace.onDidSaveTextDocument(async e => {
        if (e.uri.toString() === configUri.toString()) {
            const newConfig: any = {};
            try {
                const content = JSON.parse(e.getText());
                if (content?.compile?.onSave?.length > 0) {
                    compile.onSave = content.compile.onSave.map((v: any) => ({
                        input: vscode.Uri.joinPath(
                            workspaceRootUri, 
                            v.input
                        ),
                        output: vscode.Uri.joinPath(
                            workspaceRootUri, 
                            v.output
                        ),
                        entrypoints: v.entrypoints
                    }));
                }
                if (content.meta) newConfig.meta = content.meta;
                if (content.subgraphs) newConfig.subgraphs = content.subgraphs;
                client.sendNotification("update-config", JSON.stringify(newConfig));

                // find .rains on startup and send them to server for storing in meta store
                const newDirs: vscode.Uri[] = [];
                if (content.dirs && Array.isArray(content.dirs) && content.dirs.length > 0) {
                    for (let i = 0; i < content.dirs.length; i++) {
                        const dir = vscode.Uri.joinPath(workspaceRootUri, content.dirs[i]);
                        newDirs.push(dir);
                        if (!dirs.find(v => v.toString() === dir.toString())) {
                            vscode.workspace.findFiles(
                                new vscode.RelativePattern(newDirs[newDirs.length - 1], "**/*.rain"), 
                                "**​/node_modules/**"
                            ).then(
                                v => v.forEach(doc => vscode.workspace.openTextDocument(doc)),
                                () => { /**/ }
                            );
                        }
                    }
                }
                else {
                    const dir = vscode.Uri.joinPath(workspaceRootUri, "./src");
                    newDirs.push(dir);
                    if (!dirs.find(v => v.toString() === dir.toString())) {
                        vscode.workspace.findFiles(
                            new vscode.RelativePattern(newDirs[newDirs.length - 1], "**/*.rain"), 
                            "**​/node_modules/**"
                        ).then(
                            v => v.forEach(doc => vscode.workspace.openTextDocument(doc)),
                            () => { /**/ }
                        );
                    }
                }
                dirs = newDirs;
            }
            catch {
                compile.onSave = [];
                dirs = [];
            }
        }
        const saveConfig = compile.onSave.find(v => v.input.toString() === e.uri.toString());
        if (saveConfig) {
            const workspaceEdit = new vscode.WorkspaceEdit();
            const result = await vscode.commands.executeCommand(
                "_compile",
                e.languageId,
                e.uri.toString(),
                JSON.stringify(saveConfig.entrypoints)
            );
            const contents = Uint8Array.from(
                Array.from(
                    result 
                        ? format(
                            JSON.stringify(result, null, 2), 
                            { parser: "json", plugins: [ babelParser ] }
                        )
                        : "\"failed to compile!\""
                ).map(char => char.charCodeAt(0))
            );
            workspaceEdit.createFile(
                saveConfig.output,
                { overwrite: true, contents }
            );
            vscode.workspace.applyEdit(workspaceEdit);
        }
    });

    vscode.workspace.onDidCreateFiles(created => {
        created.files.forEach(async e => {
            if (e.toString() === configUri.toString()) {
                const newConfig: any = {};
                try {
                    const content = JSON.parse(
                        uint8ArrayToString(
                            await vscode.workspace.fs.readFile(configUri)
                        )
                    );
                    if (content?.compile?.onSave?.length > 0) {
                        compile.onSave = content.compile.onSave.map((v: any) => ({
                            input: vscode.Uri.joinPath(
                                workspaceRootUri, 
                                v.input
                            ),
                            output: vscode.Uri.joinPath(
                                workspaceRootUri, 
                                v.output
                            ),
                            entrypoints: v.entrypoints
                        }));
                    }
                    if (content.meta) newConfig.meta = content.meta;
                    if (content.subgraphs) newConfig.subgraphs = content.subgraphs;
                    client.sendNotification("update-config", JSON.stringify(newConfig));
    
                    // find .rains on startup and send them to server for storing in meta store
                    const newDirs: vscode.Uri[] = [];
                    if (content.dirs && Array.isArray(content.dirs) && content.dirs.length > 0) {
                        for (let i = 0; i < content.dirs.length; i++) {
                            const dir = vscode.Uri.joinPath(workspaceRootUri, content.dirs[i]);
                            newDirs.push(dir);
                            if (!dirs.find(v => v.toString() === dir.toString())) {
                                vscode.workspace.findFiles(
                                    new vscode.RelativePattern(newDirs[newDirs.length - 1], "**/*.rain"), 
                                    "**​/node_modules/**"
                                ).then(
                                    v => v.forEach(doc => vscode.workspace.openTextDocument(doc)),
                                    () => { /**/ }
                                );
                            }
                        }
                    }
                    else {
                        const dir = vscode.Uri.joinPath(workspaceRootUri, "./src");
                        newDirs.push(dir);
                        if (!dirs.find(v => v.toString() === dir.toString())) {
                            vscode.workspace.findFiles(
                                new vscode.RelativePattern(newDirs[newDirs.length - 1], "**/*.rain"), 
                                "**​/node_modules/**"
                            ).then(
                                v => v.forEach(doc => vscode.workspace.openTextDocument(doc)),
                                () => { /**/ }
                            );
                        }
                    }
                    dirs = newDirs;
                }
                catch {
                    compile.onSave = [];
                    dirs = [];
                }
            }
        });
    });

    vscode.workspace.onDidDeleteFiles(deleted => {
        deleted.files.forEach(e => {
            if (e.toString() === configUri.toString()) {
                compile.onSave = [];
                dirs = [];
            }
        });
    });

    // handler for rainlang compiler, send the request to server and logs the result in output channel
    const rainlangCompileHandler = async() => {
        const expKeys = Array.from((await vscode.window.showInputBox({
            title: "Expression Names",
            placeHolder: "binding-1 binding-2 ...",
            prompt: "specify the expression names in order by a whitespace seperating them"
        })).matchAll(/[^\s]+/g)).map(v => v[0]);
        const result = await vscode.commands.executeCommand(
            "_compile",
            vscode.window.activeTextEditor.document.languageId,
            vscode.window.activeTextEditor.document.uri.toString(),
            JSON.stringify(expKeys),
            {
                start: vscode.window.activeTextEditor.selection.start,
                end: vscode.window.activeTextEditor.selection.end,
            }
        );
        if (!rainlangCompilerChannel) rainlangCompilerChannel = vscode.window.createOutputChannel(
            "Rain Language Compiler",
            "json"
        );
        rainlangCompilerChannel.show(true);
        if (result) rainlangCompilerChannel.appendLine(format(
            JSON.stringify(result, null, 2), 
            { parser: "json", plugins: [ babelParser ] }
        ));
        else rainlangCompilerChannel.appendLine("undefined");
    };

    // // register the command
    context.subscriptions.push(vscode.commands.registerCommand(
        "rainlang.compile", 
        rainlangCompileHandler
    ));

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
        documentSelector: [
            { language: "rainlang" },
            { pattern: "*.rain.json", language: "json" },
        ],
        synchronize: {},
        // initializationOptions: JSON.stringify(initConfig)
    };

    // Create a worker. The worker main file implements the language server.
    const serverMain = vscode.Uri.joinPath(context.extensionUri, "dist/browser/server.js");
    const worker = new Worker(serverMain.toString(true));

    // create the language server client to communicate with the server running in the worker
    client = new LanguageClient(
        "rainlang", 
        "Rain Language", 
        clientOptions, 
        worker
    );

    await client.start();

    // set the workspace root URI on startup
    client.onNotification("request-config", async e => {
        if (e !== null) {
            workspaceRootUri = vscode.Uri.parse(e);
            // wait for server to fully start
            // await sleep(6000);
            try {
                const conf: any = {};
                configUri = vscode.Uri.joinPath(
                    workspaceRootUri, 
                    configPath
                );
                const content = JSON.parse(
                    uint8ArrayToString(
                        await vscode.workspace.fs.readFile(configUri)
                    )
                );
                if (content?.compile?.onSave?.length > 0) {
                    compile.onSave = content.compile.onSave.map((v: any) => ({
                        input: vscode.Uri.joinPath(
                            workspaceRootUri, 
                            v.input
                        ),
                        output: vscode.Uri.joinPath(
                            workspaceRootUri, 
                            v.output
                        ),
                        entrypoints: v.entrypoints
                    }));
                }
                if (content.meta) conf.meta = content.meta;
                if (content.subgraphs) conf.subgraphs = content.subgraphs;
                client.sendNotification("update-config", JSON.stringify(conf));

                // find .rains on startup and send them to server for storing in meta store
                if (content.dirs && Array.isArray(content.dirs) && content.dirs.length > 0) {
                    for (let i = 0; i < content.dirs.length; i++) {
                        dirs.push(vscode.Uri.joinPath(workspaceRootUri, content.dirs[i]));
                        vscode.workspace.findFiles(
                            new vscode.RelativePattern(dirs[dirs.length - 1], "**/*.rain"), 
                            "**​/node_modules/**"
                        ).then(
                            v => v.forEach(doc => vscode.workspace.openTextDocument(doc)),
                            () => { /**/ }
                        );
                    }
                }
                else {
                    dirs.push(vscode.Uri.joinPath(workspaceRootUri, "./src"));
                    vscode.workspace.findFiles(
                        new vscode.RelativePattern(dirs[dirs.length - 1], "**/*.rain"), 
                        "**​/node_modules/**"
                    ).then(
                        v => v.forEach(doc => vscode.workspace.openTextDocument(doc)),
                        () => { /**/ }
                    );
                }
            }
            catch {
                compile.onSave = [];
                dirs = [];
            }
        }

    });
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) return undefined;
    return client.stop();
}

function getCurrentWorkspaceDir(): vscode.Uri | undefined {
    const currentWorkspaceEditor = vscode.window.activeTextEditor?.document.uri;
    return currentWorkspaceEditor 
        ? vscode.workspace.getWorkspaceFolder(currentWorkspaceEditor)?.uri 
        : undefined;
}

async function sleep(ms: number) {
    let _to;
    return new Promise(
        resolve => _to = setTimeout(resolve, ms)
    ).finally(
        () => clearTimeout(_to)
    );
}

function uint8ArrayToString(uint8array: Uint8Array): string {
    let str = "";
    for (let i = 0; i < uint8array.length; i++) {
        str = str + String.fromCharCode(uint8array[i]);
    }
    return str;
}