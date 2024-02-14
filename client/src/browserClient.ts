import * as vscode from "vscode";
import { format } from "prettier/standalone";
import babelParser from "prettier/parser-babel";
import { LanguageClient, LanguageClientOptions } from "vscode-languageclient/browser";


let client: LanguageClient;
const defaultConfigPath = "./rainconfig.json";

// this method is called when vs code is activated
export async function activate(context: vscode.ExtensionContext) {
    
    // status of the client/server
    const extStatus = { onsave: true, active: true };

    // disposables to free at server stop
    let disposables: vscode.Disposable[] = [];

    // default config uri set at the fisrt start of the server
    let defaultConfigUri: vscode.Uri;

    // config file URI
    let configUri: vscode.Uri;

    // workspace root URI
    let workspaceRootUri: vscode.Uri;

    // directories to check for rain documents, default is "src"
    let watched: vscode.Uri[] = [];

    // channel for rainlang compiler
    let compilerChannel: vscode.OutputChannel;

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
        documentSelector: [
            { language: "rainlang" },
            // { pattern: "*rainconfig.json", language: "json" },
        ],
        synchronize: {},
        // initializationOptions: JSON.stringify(initConfig)
    };

    // Create a worker. The worker main file implements the language server.
    const serverMain = vscode.Uri.joinPath(context.extensionUri, "dist/browser/server.js");

    // setup the statusbar
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    statusBar.text = "rainlang-ext";
    updateStatus();

    // add subscriptions
    context.subscriptions.push(
        statusBar,
        vscode.commands.registerCommand("rainlang.start", start),
        vscode.commands.registerCommand("rainlang.stop", stop),
        vscode.commands.registerCommand("rainlang.restart", restart),
        // vscode.commands.registerCommand("rainlang.onsave", updateOnSaveCompile),
        vscode.commands.registerCommand("rainlang.compose", composeHandler),
        // vscode.commands.registerCommand("rainlang.compile.all", compileAllHandler)
    );

    function updateStatus() {
        statusBar.hide();
        if (extStatus.active) {
            statusBar.tooltip = new vscode.MarkdownString("Rainlang Extension (running)", true);
            statusBar.tooltip.isTrusted = true;
            statusBar.tooltip.appendMarkdown([
                "\n\n[Stop Server](command:rainlang.stop)",
                "\n\n[Restart Server](command:rainlang.restart)",
                // "\n\n---\n\n",
                // "\n\n[Compile](command:rainlang.compile.all)",
            ].join(""));
            // if (extStatus.onsave) statusBar.tooltip.appendMarkdown(
            //     "\n\n[Turn Off Compile-On-Save](command:rainlang.onsave)",
            // );
            // else statusBar.tooltip.appendMarkdown(
            //     "\n\n[Turn On Compile-On-Save](command:rainlang.onsave)",
            // );
        }
        else {
            statusBar.tooltip = new vscode.MarkdownString("Rainlang Extension (stopped)", true);
            statusBar.tooltip.isTrusted = true;
            statusBar.tooltip.appendMarkdown("\n\n[Start Server](command:rainlang.start)");
        }
        statusBar.show();
    }

    // handler for rainlang compiler, send the request to server and logs the result in output channel
    async function composeHandler() {
        if (client && extStatus.active) {
            const expKeys = Array.from((await vscode.window.showInputBox({
                title: "Expression Names",
                placeHolder: "binding-1 binding-2 ...",
                prompt: "specify the expression names in order by a whitespace seperating them"
            })).matchAll(/[^\s]+/g)).map(v => v[0]);
            if (!compilerChannel) compilerChannel = vscode.window.createOutputChannel(
                "Rain Language Compiler",
                // "code-runner-output"
            );
            try {
                const result = await vscode.commands.executeCommand(
                    "_compose",
                    vscode.window.activeTextEditor.document.languageId,
                    vscode.window.activeTextEditor.document.uri.toString(),
                    JSON.stringify(expKeys),
                    // {
                    //     start: vscode.window.activeTextEditor.selection.start,
                    //     end: vscode.window.activeTextEditor.selection.end,
                    // }
                );
                compilerChannel.show(true);
                if (result[1]) {
                    compilerChannel.appendLine([
                        new Date(),
                        result[0],
                    ].join("\n\n"));
                } else {
                    compilerChannel.appendLine([
                        new Date(),
                        JSON.stringify(result[0], null, 2),
                    ].join("\n\n"));
                }
            } catch (e) {
                console.log(e);
                compilerChannel.show(true);
                compilerChannel.appendLine([
                    new Date(),
                    JSON.stringify(e, null, 2),
                ].join("\n\n"));
            }
        }
        else vscode.window.showErrorMessage("rain language server is not running!");
    }

    async function restart() {
        if (!extStatus.active) {
            vscode.window.showWarningMessage("rain language server is not running!");
        }
        else {
            await stop();
            await start();
        }
    }

    async function stop() {
        if (!extStatus.active) {
            vscode.window.showWarningMessage("rain language server is not running!");
        }
        else {
            watched = [];
            configUri = undefined;
            disposables.forEach(v => v?.dispose());
            disposables = [];
            await client.stop();
            client = undefined;
            extStatus.active = false;
            updateStatus();
        }
    }

    async function start() {
        if (extStatus.active) {
            vscode.window.showWarningMessage("rain language server is already running!");
        }
        else await _start();
    }

    async function _start() {
        // auto compile on save implementation
        disposables.push(vscode.workspace.onDidSaveTextDocument(async e => {
            try {
                if (e.uri.toString() === configUri.toString()) {
                    const content = JSON.parse(e.getText());
                    processConfig(content);
                }
            }
            catch {
                watched = [];
            }
        }));

        disposables.push(vscode.workspace.onDidCreateFiles(async created => {
            let didProcessConfig = false;
            if (configUri === undefined && defaultConfigUri !== undefined) {
                for (let i = 0; i < created.files.length; i++) {
                    if (created.files[i].toString() === defaultConfigUri.toString()) {
                        try {
                            configUri = defaultConfigUri;
                            const content = JSON.parse(
                                uint8ArrayToString(
                                    await vscode.workspace.fs.readFile(defaultConfigUri)
                                )
                            );
                            didProcessConfig = true;
                            processConfig(content);
                            break;
                        }
                        catch {
                            watched = [];
                            client.sendNotification("unwatch-all");
                            break;
                        }
                    }
                }
            }
            if (!didProcessConfig && configUri !== undefined) reloadWatched();
        }));

        disposables.push(vscode.workspace.onDidDeleteFiles(deleted => {
            if (configUri !== undefined) {
                for (let i = 0; i < deleted.files.length; i++) {
                    try {
                        if (deleted.files[i].toString() === configUri.toString()) {
                            watched = [];
                            configUri = undefined;
                            client.sendNotification("unwatch-all");
                            break;
                        }
                    }
                    catch { /**/ }
                }
            }
            if (configUri !== undefined) reloadWatched();
        }));

        disposables.push(vscode.workspace.onDidRenameFiles(async renamed => {
            let didProcessConfig = false;
            if (configUri === undefined) {
                if(defaultConfigUri !== undefined) for(let i = 0; i < renamed.files.length; i++) {
                    try {
                        if (renamed.files[i].newUri.toString() === defaultConfigUri.toString()) {
                            configUri = defaultConfigUri;
                            const content = JSON.parse(
                                uint8ArrayToString(
                                    await vscode.workspace.fs.readFile(defaultConfigUri)
                                )
                            );
                            didProcessConfig = true;
                            processConfig(content);
                            break;
                        }
                    }
                    catch { 
                        watched = [];
                        client.sendNotification("unwatch-all");
                        break;
                    }
                }
            }
            else {
                for (let i = 0; i < renamed.files.length; i++) {
                    try {
                        if (renamed.files[i].oldUri.toString() === configUri.toString()) {
                            if(renamed.files[i].newUri.toString() ===defaultConfigUri?.toString()){
                                configUri = defaultConfigUri;
                                break;
                            }
                            watched = [];
                            configUri = undefined;
                            client.sendNotification("unwatch-all");
                            break;
                        }
                    }
                    catch { /**/ }
                }
            }
            if (!didProcessConfig && configUri !== undefined) reloadWatched();
        }));

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
        disposables.push(client.onNotification("request-config", async e => {
            if (e !== null) {
                workspaceRootUri = vscode.Uri.parse(e);
                // wait for server to fully start
                // await sleep(6000);
                try {
                    defaultConfigUri = vscode.Uri.joinPath(workspaceRootUri, defaultConfigPath);
                    const exists = await isConfig(defaultConfigUri);
                    if (exists) configUri = defaultConfigUri;
                    const content = JSON.parse(
                        uint8ArrayToString(
                            await vscode.workspace.fs.readFile(configUri)
                        )
                    );
                    processConfig(content);
                }
                catch {
                    watched = [];
                }
            }
        }));

        extStatus.active = true;
        updateStatus();
    }

    // start server once
    await _start();

    // reload .rain watched files
    async function reloadWatched() {
        const promiseGroup1: any[] = [];
        const promiseGroup2: any[] = [];
        await client.sendNotification("unwatch-all");
        for (const dir of watched) {
            promiseGroup1.push(findRainFiles(dir).then(
                v => v.forEach(doc => promiseGroup2.push(vscode.workspace.fs.readFile(doc).then(
                    e => client.sendNotification(
                        "watch-dotrain", 
                        [doc.toString(), uint8ArrayToString(e)]
                    ),
                    () => { /**/ }
                ))),
                () => { /**/ }
            ));
        }
        await Promise.allSettled(promiseGroup1);
        await Promise.allSettled(promiseGroup2);
        client.sendNotification("reval-all");
    }

    // processes the configuration file contents
    async function processConfig(content: any) {
        const promiseGroup1: any[] = [];
        const promiseGroup2: any[] = [];
        const newWatched: vscode.Uri[] = [];
        await client.sendNotification("unwatch-all");
        updateMetaStore(content, workspaceRootUri);

        // find .rains on startup and send them to server for storing in meta store
        if (
            content?.include?.length > 0 && 
            Array.isArray(content.include) && 
            content.include.every((v: any) => typeof v === "string")
        ) {
            for (let i = 0; i < content.include.length; i++) {
                const dir = vscode.Uri.joinPath(workspaceRootUri, content.include[i]);
                newWatched.push(dir);
                promiseGroup1.push(findRainFiles(dir).then(
                    v => v.forEach(doc => promiseGroup2.push(vscode.workspace.fs.readFile(doc).then(
                        e => client.sendNotification(
                            "watch-dotrain", 
                            [doc.toString(), uint8ArrayToString(e)]
                        ),
                        () => { /**/ }
                    ))),
                    () => { /**/ }
                ));
            }
        }
        watched = newWatched;
        await Promise.allSettled(promiseGroup1);
        await Promise.allSettled(promiseGroup2);
        client.sendNotification("reval-all");
    }
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

function stringToUint8Array(text: string): Uint8Array {
    const encoder = new TextEncoder();
    return encoder.encode(text);
}

function uint8ArrayToString(uint8array: Uint8Array): string {
    const decoder = new TextDecoder();
    return decoder.decode(uint8array);
}

function hexlify(value: Uint8Array): string {
    let result = "0x";
    for (let i = 0; i < value.length; i++) {
        result += value[i].toString(16).padStart(2, "0");
    }
    return result;
}

function arrayify(value: string): Uint8Array {
    const array: number[] = [];
    const v = value.startsWith("0x") ? value.substring(2) : value;
    for (let i = 0; i < v.length; i += 2) {
        array.push(parseInt(v.substring(i, i + 2), 16));
    }
    return Uint8Array.from(array);
}

// finds .rain files by searching recursively in the given directory, ignores "node_modules" directories
async function findRainFiles(uri: vscode.Uri): Promise<vscode.Uri[]> {
    const foundFiles: vscode.Uri[] = [];
    try {
        const stat = await vscode.workspace.fs.stat(uri);
        if (stat.type !== vscode.FileType.Directory) {
            if (stat.type === vscode.FileType.File && uri.toString().endsWith(".rain")) {
                foundFiles.push(uri);
            }
            else throw "not a directory";
        }
        else {
            const readResult = await vscode.workspace.fs.readDirectory(uri);
            for (const [ path, type ] of readResult) {
                if (type === vscode.FileType.File) { 
                    if (path.endsWith(".rain")) foundFiles.push(
                        vscode.Uri.joinPath(uri, path)
                    );
                }
                else if (type === vscode.FileType.Directory) {
                    if (path !== "node_modules") foundFiles.push(
                        ...(await findRainFiles(vscode.Uri.joinPath(uri, path)))
                    );
                }
            }
        }
    }
    catch { /**/ }
    return foundFiles;
}

// update meta store
async function updateMetaStore(content: any, workspaceRootUri: vscode.Uri): Promise<void> {
    const metas = [];
    const subgraphs = [];
    const deployers = [];
    if (content.subgraphs) {
        if (
            Array.isArray(content.subgraphs) && 
            content.subgraphs.every((v: any) => typeof v === "string")
        ) subgraphs.push(...content.subgraphs);
    }
    client.sendNotification("update-meta-store", [subgraphs]);
}

// checks if a config file exists
async function isConfig(uri: vscode.Uri): Promise<boolean> {
    try {
        const stat = await vscode.workspace.fs.stat(uri);
        if (stat.type === vscode.FileType.File) return true;
        else return false;
    }
    catch (error) {
        return false;
    }
}
