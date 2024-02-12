import * as vscode from "vscode";
import { format } from "prettier/standalone";
import babelParser from "prettier/parser-babel";
import { LanguageClient, LanguageClientOptions } from "vscode-languageclient/browser";


let client: LanguageClient;
const defaultConfigPath1 = "./rainconfig.json";
const defaultConfigPath2 = "./.rainconfig.json";

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

    // // auto compile mappings
    // const compile = { onSave: [] };

    // channel for rainlang compiler
    let compilerChannel: vscode.OutputChannel;

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
        documentSelector: [
            { language: "rainlang" },
            { pattern: "*rainconfig.json", language: "json" },
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
        vscode.commands.registerCommand("rainlang.compile", compileCurrentHandler),
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
    async function compileCurrentHandler() {
        if (client && extStatus.active) {
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
                "uri"
                // {
                //     start: vscode.window.activeTextEditor.selection.start,
                //     end: vscode.window.activeTextEditor.selection.end,
                // }
            );
            if (!compilerChannel) compilerChannel = vscode.window.createOutputChannel(
                "Rain Language Compiler",
                "json"
            );
            compilerChannel.show(true);
            if (result) compilerChannel.appendLine(format(
                JSON.stringify(result, null, 2), 
                { parser: "json", plugins: [ babelParser ] }
            ));
            else compilerChannel.appendLine("undefined");
        }
        else vscode.window.showErrorMessage("rain language server is not running!");
    }

    // // handler for rainlang compiler by sending the request to server for a mapping
    // async function compileAllHandler() {
    //     if (client && extStatus.active) {
    //         const workspaceEdit = new vscode.WorkspaceEdit();
    //         for (const map of compile.onSave) {
    //             try {
    //                 const fileContent = uint8ArrayToString(
    //                     await vscode.workspace.fs.readFile(map.input)
    //                 );
    //                 const result = await vscode.commands.executeCommand(
    //                     "_compile",
    //                     "rainlang",
    //                     fileContent,
    //                     JSON.stringify(map.entrypoints),
    //                     "file"
    //                 );
    //                 const contents = Uint8Array.from(
    //                     Array.from(result 
    //                         ? format(
    //                             JSON.stringify(result, null, 2), 
    //                             { parser: "json", plugins: [ babelParser ] }
    //                         )
    //                         : "\"failed to compile!\""
    //                     ).map(char => char.charCodeAt(0))
    //                 );
    //                 workspaceEdit.createFile(
    //                     map.output,
    //                     { overwrite: true, contents }
    //                 );
    //             }
    //             catch { /**/ }
    //         }
    //         vscode.workspace.applyEdit(workspaceEdit);
    //     }
    //     else vscode.window.showErrorMessage("rain language server is not running!");
    // }

    // function updateOnSaveCompile() {
    //     if (extStatus.onsave) extStatus.onsave = false;
    //     else extStatus.onsave = true;
    //     updateStatus();
    // }

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
            // compile.onSave = [];
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
                // compile.onSave = [];
            }
            // if (extStatus.onsave) {
            //     const saveMap = compile.onSave.find(v => v.input.toString() === e.uri.toString());
            //     if (saveMap) {
            //         const workspaceEdit = new vscode.WorkspaceEdit();
            //         const result = await vscode.commands.executeCommand(
            //             "_compile",
            //             e.languageId,
            //             e.uri.toString(),
            //             JSON.stringify(saveMap.entrypoints),
            //             "uri"
            //         );
            //         const contents = Uint8Array.from(
            //             Array.from(result 
            //                 ? format(
            //                     JSON.stringify(result, null, 2), 
            //                     { parser: "json", plugins: [ babelParser ] }
            //                 )
            //                 : "\"failed to compile!\""
            //             ).map(char => char.charCodeAt(0))
            //         );
            //         workspaceEdit.createFile(
            //             saveMap.output,
            //             { overwrite: true, contents }
            //         );
            //         vscode.workspace.applyEdit(workspaceEdit);
            //     }
            // }
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
                            // compile.onSave = [];
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
                            // compile.onSave = [];
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
                        // compile.onSave = [];
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
                            // compile.onSave = [];
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
                    defaultConfigUri = vscode.Uri.joinPath(workspaceRootUri, defaultConfigPath1);
                    configUri = defaultConfigUri;
                    const content = JSON.parse(
                        uint8ArrayToString(
                            await vscode.workspace.fs.readFile(configUri)
                        )
                    );
                    processConfig(content);
                }
                catch {
                    watched = [];
                    // compile.onSave = [];
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
        // if (
        //     content?.src?.length > 0 && 
        //     Array.isArray(content.src) && 
        //     content.src.every((v: any) => 
        //         typeof v === "object" &&
        //         v.input !== undefined &&
        //         v.output !== undefined &&
        //         v.entrypoints !== undefined &&
        //         typeof v.input === "string" &&
        //         typeof v.output === "string" &&
        //         v.input.endsWith(".rain") &&
        //         Array.isArray(v.entrypoints) &&
        //         v.entrypoints.length > 0 &&
        //         v.entrypoints.every((e: any) => typeof e === "string")
        //     )
        // ) {
        //     compile.onSave = content.src.map((v: any) => ({
        //         input: vscode.Uri.joinPath(
        //             workspaceRootUri, 
        //             v.input
        //         ),
        //         output: vscode.Uri.joinPath(
        //             workspaceRootUri, 
        //             v.output.endsWith(".json") ? v.output : v.output + ".json"
        //         ),
        //         entrypoints: v.entrypoints
        //     }));
        //     for (const {input} of compile.onSave) {
        //         promiseGroup1.push(vscode.workspace.fs.stat(input).then(stat => {
        //             if (stat.type === vscode.FileType.File) {
        //                 promiseGroup2.push(vscode.workspace.fs.readFile(input).then(
        //                     v => client.sendNotification(
        //                         "watch-dotrain", 
        //                         [input.toString(), uint8ArrayToString(v)]
        //                     ),
        //                     () => { /**/ }
        //                 ));
        //             }
        //         }));
        //         newWatched.push(input);
        //     }
        // }

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
    // if (Array.isArray(content?.meta) && content.length > 0) {
    //     for (let i = 0; i < content.meta.length; i++) {
    //         const meta = content.meta[i];
    //         const keys = Object.keys(meta);
    //         if (
    //             keys.length >= 1 && 
    //             (    
    //                 (
    //                     keys.includes("binary") &&
    //                     !keys.includes("hex") &&
    //                     typeof meta.binary === "string"
    //                 ) || (
    //                     keys.includes("hex") &&
    //                     !keys.includes("binary") &&
    //                     typeof meta.hex === "string"
    //                 )
    //             )
    //         ) {
    //             if (keys.includes("binary")) {
    //                 const uri = vscode.Uri.joinPath(workspaceRootUri, meta.binary);
    //                 try {
    //                     metas.push(hexlify(await vscode.workspace.fs.readFile(uri)));
    //                 }
    //                 catch { /**/ }
    //             }
    //             if (keys.includes("hex")) {
    //                 const uri = vscode.Uri.joinPath(workspaceRootUri, meta.hex);
    //                 try {
    //                     metas.push(uint8ArrayToString(await vscode.workspace.fs.readFile(uri)));
    //                 }
    //                 catch { /**/ }
    //             }
    //         }
    //     }
    // }
    // if (typeof content.deployers === "object" && content.deployers !== null) {
    //     const items = Object.entries(content.deployers);
    //     for (let i = 0; i < items.length; i ++) {
    //         const [hash, details] = items[i];
    //         if (
    //             /^0x[a-fA-F0-9]+$/.test(hash) &&
    //             typeof details === "object" &&
    //             details !== null &&
    //             Object.keys(details).length >= 5 &&
    //             "expressionDeployer" in details &&
    //             typeof details.expressionDeployer === "string" &&
    //             "parser" in details &&
    //             typeof details.parser === "string" &&
    //             "store" in details &&
    //             typeof details.store === "string" &&
    //             "interpreter" in details &&
    //             typeof details.interpreter === "string" &&
    //             "constructionMeta" in details &&
    //             typeof details.constructionMeta === "object" &&
    //             details.constructionMeta !== null &&
    //             (
    //                 (
    //                     "binary" in details.constructionMeta && 
    //                     !("hex" in details.constructionMeta) && 
    //                     typeof details.constructionMeta.binary === "string"
    //                 ) || (
    //                     "hex" in details.constructionMeta && 
    //                     !("binary" in details.constructionMeta) && 
    //                     typeof details.constructionMeta.hex === "string"
    //                 )
    //             )
    //         ) {
    //             try {
    //                 const parserPath = vscode.Uri.joinPath(workspaceRootUri, details.parser);
    //                 const parserArtifact = JSON.parse(
    //                     uint8ArrayToString(await vscode.workspace.fs.readFile(parserPath))
    //                 );
    //                 const parser = typeof parserArtifact.deployedBytecode.object === "string" && parserArtifact.deployedBytecode.object
    //                     ? parserArtifact.deployedBytecode.object
    //                     : undefined;

    //                 const storePath = vscode.Uri.joinPath(workspaceRootUri, details.store);
    //                 const storeArtifact = JSON.parse(
    //                     uint8ArrayToString(await vscode.workspace.fs.readFile(storePath))
    //                 );
    //                 const store = typeof storeArtifact.deployedBytecode.object === "string" && storeArtifact.deployedBytecode.object
    //                     ? storeArtifact.deployedBytecode.object
    //                     : undefined;

    //                 const interpreterPath = vscode.Uri.joinPath(
    //                     workspaceRootUri, 
    //                     details.interpreter
    //                 );
    //                 const interpreterArtifact = JSON.parse(
    //                     uint8ArrayToString(await vscode.workspace.fs.readFile(interpreterPath))
    //                 );
    //                 const interpreter = typeof interpreterArtifact.deployedBytecode.object === "string" && interpreterArtifact.deployedBytecode.object
    //                     ? interpreterArtifact.deployedBytecode.object
    //                     : undefined;

    //                 const deployerPath = vscode.Uri.joinPath(
    //                     workspaceRootUri, 
    //                     details.expressionDeployer
    //                 );
    //                 const deployerArtifact = JSON.parse(
    //                     uint8ArrayToString(await vscode.workspace.fs.readFile(deployerPath))
    //                 );
    //                 const deployerDeployedBytecode = typeof deployerArtifact.deployedBytecode.object === "string" && deployerArtifact.deployedBytecode.object
    //                     ? deployerArtifact.deployedBytecode.object
    //                     : undefined;
    //                 const deployerBytecode = typeof deployerArtifact.bytecode.object === "string" && deployerArtifact.bytecode.object
    //                     ? deployerArtifact.bytecode.object
    //                     : undefined;

    //                 if (!parser || !store || !interpreter || !deployerBytecode || !deployerDeployedBytecode) throw "";

    //                 let metaBytes = null;
    //                 if ("hex" in details.constructionMeta && typeof details.constructionMeta.hex === "string") {
    //                     const uri =  vscode.Uri.joinPath(
    //                         workspaceRootUri, 
    //                         details.constructionMeta.hex
    //                     );
    //                     metaBytes = uint8ArrayToString(await vscode.workspace.fs.readFile(uri));
    //                 }
    //                 if ("binary" in details.constructionMeta && typeof details.constructionMeta.binary === "string") {
    //                     const uri = vscode.Uri.joinPath(
    //                         workspaceRootUri, 
    //                         details.constructionMeta.binary
    //                     );
    //                     metaBytes = hexlify(await vscode.workspace.fs.readFile(uri));
    //                 }

    //                 if (!metaBytes) throw "";

    //                 deployers.push([
    //                     hash,
    //                     metaBytes,
    //                     deployerBytecode,
    //                     deployerDeployedBytecode,
    //                     parser, 
    //                     store,
    //                     interpreter
    //                 ]);
    //             }
    //             catch { /**/ }
    //         }
    //     }
    // }

    client.sendNotification("update-meta-store", [subgraphs, metas, deployers]);
}
