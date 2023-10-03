import * as vscode from "vscode";
import { format } from "prettier/standalone";
import babelParser from "prettier/parser-babel";
import { LanguageClient, LanguageClientOptions } from "vscode-languageclient/browser";


let client: LanguageClient;
const defaultConfigPath = "./config.rain.json";

// this method is called when vs code is activated
export async function activate(context: vscode.ExtensionContext) {
    
    let configUri: vscode.Uri;
    let workspaceRootUri: vscode.Uri;
    const initConfig: any = {};
    const autoCompile = { onSave: [] };

    // get the initial settings and pass them as initialzeOptions to server
    const initSettings = vscode.workspace.getConfiguration("rainlang");

    // setting the config file and init configs
    const configPath = initSettings.config
        ? initSettings.config as string 
        : defaultConfigPath;

    for (let i = 0; i < 5; i++) {
        workspaceRootUri = getCurrentWorkspaceDir();
        if (!workspaceRootUri) await sleep(3000);
        else break;
    }
    if (workspaceRootUri) {
        try {
            configUri = vscode.Uri.joinPath(
                workspaceRootUri, 
                configPath
            );
            const content = JSON.parse(
                String.fromCharCode.apply(
                    null, (
                        await vscode.workspace.fs.readFile(configUri)
                    )
                )
            );
            if (content?.autoCompile?.onSave?.length > 0) {
                autoCompile.onSave = content.autoCompile.onSave.map((v: any) => ({
                    source: vscode.Uri.joinPath(
                        workspaceRootUri, 
                        v.source
                    ),
                    destination: vscode.Uri.joinPath(
                        workspaceRootUri, 
                        v.destination
                    ),
                    entrypoints: v.entrypoints
                }));
            }
            if (content.meta) initConfig.meta = content.meta;
            if (content.subgraphs) initConfig.subgraphs = content.subgraphs;
        }
        catch { /**/ }
    }

    vscode.workspace.onDidChangeTextDocument(e => {
        if (e.document.uri.toString() === configUri.toString()) {
            const newConfig: any = {};
            try {
                const content = JSON.parse(e.document.getText());
                if (content?.autoCompile?.onSave?.length > 0) {
                    autoCompile.onSave = content.autoCompile.onSave.map((v: any) => ({
                        source: vscode.Uri.joinPath(
                            workspaceRootUri, 
                            v.source
                        ),
                        destination: vscode.Uri.joinPath(
                            workspaceRootUri, 
                            v.destination
                        ),
                        entrypoints: v.entrypoints
                    }));
                }
                if (content.meta) newConfig.meta = content.meta;
                if (content.subgraphs) newConfig.subgraphs = content.subgraphs;
            }
            catch { /**/ }
            client.sendNotification("change-rain-config", JSON.stringify(newConfig));
        }
    });

    vscode.workspace.onDidChangeConfiguration(async(e) => {
        if (e.affectsConfiguration("rainlang.config")) {
            try {
                const newConfig: any = {};
                const newPath = vscode.workspace.getConfiguration("rainlang").config;
                const newConfigPath = newPath && typeof newPath === "string" 
                    ? newPath 
                    : defaultConfigPath;
                if (newConfigPath && typeof newConfigPath === "string") {
                    configUri = vscode.Uri.joinPath(
                        workspaceRootUri, 
                        newConfigPath
                    );
                    try {
                        const content = JSON.parse(
                            String.fromCharCode.apply(
                                null, (
                                    await vscode.workspace.fs.readFile(configUri)
                                )
                            )
                        );
                        if (content?.autoCompile?.onSave?.length > 0) {
                            autoCompile.onSave = content.autoCompile.onSave.map((v: any) => ({
                                source: vscode.Uri.joinPath(
                                    workspaceRootUri, 
                                    v.source
                                ),
                                destination: vscode.Uri.joinPath(
                                    workspaceRootUri, 
                                    v.destination
                                ),
                                entrypoints: v.entrypoints
                            }));
                        }
                        if (content.meta) newConfig.meta = content.meta;
                        if (content.subgraphs) newConfig.subgraphs = content.subgraphs;
                        client.sendNotification("change-rain-config", JSON.stringify(newConfig));
                    }
                    catch {
                        vscode.window.showErrorMessage(
                            "Cannot find or read the config file"
                        );
                    }
                }
            }
            catch { /**/ }
        }
    });

    // channel for rainlang compiler
    let rainlangCompilerChannel: vscode.OutputChannel;

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

    // auto compile on save implementation
    vscode.workspace.onDidSaveTextDocument(async e => {
        const autoCompile = vscode.workspace.getConfiguration("rainlang.autoCompile");
        if (typeof autoCompile.onSave === "string" && autoCompile.onSave) {
            const workspaceRootUri = getCurrentWorkspaceDir();
            if (workspaceRootUri) {
                try {
                    const mappingFileUri = vscode.Uri.joinPath(
                        workspaceRootUri, 
                        autoCompile.onSave
                    );
                    const content = JSON.parse(
                        String.fromCharCode.apply(
                            null, (
                                await vscode.workspace.fs.readFile(mappingFileUri)
                            )
                        )
                    );
                    if (Array.isArray(content) && content.length) {
                        const ENTRYPOINT_PATTERN = /^[a-z][0-9a-z-]*$/;
                        const JSON_PATH_PATTERN = /^(\.\/)(\.\/|\.\.\/|[^]*\/)*[^]+\.json$/;
                        const DOTRAIN_PATH_PATTERN = /^(\.\/)(\.\/|\.\.\/|[^]*\/)*[^]+\.rain$/;
                        const filesToCompile: {
                            dotrain: vscode.Uri,
                            json: vscode.Uri,
                            entrypoints: string[]
                        }[] = content?.map((v: any) => {
                            if (
                                typeof v.dotrain === "string"
                                && DOTRAIN_PATH_PATTERN.test(v.dotrain)
                                && typeof v.json === "string"
                                && JSON_PATH_PATTERN.test(v.json)
                                && Array.isArray(v.entrypoints)
                                && v.entrypoints.length
                                && v.entrypoints.every((name: any) => 
                                    typeof name === "string"
                                    && ENTRYPOINT_PATTERN.test(name)
                                )
                            ) {
                                try {
                                    const dotrain = vscode.Uri.joinPath(
                                        workspaceRootUri,
                                        v.dotrain
                                    );
                                    const json = vscode.Uri.joinPath(
                                        workspaceRootUri,
                                        v.json
                                    );
                                    if (dotrain && json) {
                                        return { 
                                            dotrain, 
                                            json, 
                                            entrypoints: v.entrypoints 
                                        };
                                    }
                                    else return undefined;
                                }
                                catch { return undefined; }
                            }
                            else return undefined;
                        })?.filter(v => 
                            v !== undefined && v.dotrain.toString() === e.uri.toString()
                        ) ?? [];
                        if (filesToCompile.length) {
                            const workspaceEdit = new vscode.WorkspaceEdit();
                            for (let i = 0; i < filesToCompile.length; i++) {
                                const result = await vscode.commands.executeCommand(
                                    "_compile",
                                    e.languageId,
                                    e.uri.toString(),
                                    JSON.stringify(filesToCompile[i].entrypoints)
                                );
                                const contents: Uint8Array = new Uint8Array(Buffer.from(
                                    format(
                                        result 
                                            ? JSON.stringify(result, null, 2) 
                                            : "failed to compile!",
                                        { parser: "json", plugins: [ babelParser ] }
                                    )
                                ));
                                workspaceEdit.createFile(
                                    filesToCompile[i].json,
                                    { overwrite: true, contents }
                                );
                            }
                            vscode.workspace.applyEdit(workspaceEdit);
                        }
                    }
                }
                catch (err) {
                    vscode.window.showErrorMessage(
                        (err as Error).message
                    );
                    vscode.window.showErrorMessage(
                        "Failed to find mapping file or it contains invalid content"
                    );
                }
            }
        }
    });

    // auto compile on save implementation
    vscode.workspace.onDidSaveTextDocument(async e => {
        const saveConfig = autoCompile.onSave.find(v => v.source.toString() === e.uri.toString());
        if (saveConfig) {
            const workspaceEdit = new vscode.WorkspaceEdit();
            const result = await vscode.commands.executeCommand(
                "_compile",
                e.languageId,
                e.uri.toString(),
                JSON.stringify(saveConfig.entrypoints)
            );
            const contents: Uint8Array = new Uint8Array(Buffer.from(
                result 
                    ? format(
                        JSON.stringify(result, null, 2), 
                        { parser: "json", plugins: [ babelParser ] }
                    )
                    : "\"failed to compile!\""
            ));
            workspaceEdit.createFile(
                saveConfig.destination,
                { overwrite: true, contents }
            );
            vscode.workspace.applyEdit(workspaceEdit);
        }
    });

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
        documentSelector: [
            { language: "rainlang" },
            // { language: "javascript" },
            // { language: "typescript" }
        ],
        synchronize: {},
        initializationOptions: JSON.stringify(initConfig)
    };

    // Create a worker. The worker main file implements the language server.
    const serverMain = vscode.Uri.joinPath(context.extensionUri, "dist/browser/server.js");
    const worker = new Worker(serverMain.toString(true));

    // create the language server client to communicate with the server running in the worker
    const client = new LanguageClient(
        "rainlang", 
        "Rain Language", 
        clientOptions, 
        worker
    );

    await client.start();
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
    let _timeoutReference;
    return new Promise(
        resolve => _timeoutReference = setTimeout(resolve, ms)
    ).finally(
        () => clearTimeout(_timeoutReference)
    );
}