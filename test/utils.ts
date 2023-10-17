import * as vscode from "vscode";


/**
 * @public Waits for provided miliseconds
 * @param ms - Miliseconds to wait
 */
export async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * @public Get the text document URI of a file path
 * 
 * @param workspace - The workspace URI
 * @param filePath - The file path with its extention
 * @returns The URI of the file
 */
export const getDocUri = (workspace: string | vscode.Uri, filePath: string) => {
    let rootUri: vscode.Uri;
    if (typeof workspace === "string") rootUri = vscode.Uri.parse(
        workspace
    );
    else rootUri = workspace;
    return vscode.Uri.joinPath(rootUri, filePath);
};

/**
 * @public Activates the vscode.lsp-sample extension
 * 
 * @param docUri - The URI of the text document
 * @returns extention, textDocument and active editor where text document is opened on
 */
export async function activate(docUri: vscode.Uri): Promise<{
    doc: vscode.TextDocument,
    editor: vscode.TextEditor,
    ext: vscode.Extension<any>
}> {
    try {
        // The extensionId is `publisher.name` from package.json
        const ext = vscode.extensions.getExtension("rainprotocol.rainlang-vscode")!;
        // activate only if not already active
        if (!ext.isActive) {
            await ext.activate();
            await sleep(5000); // Wait for server activation
        }
        const doc = await vscode.workspace.openTextDocument(docUri);
        const editor = await vscode.window.showTextDocument(doc);
        await sleep(500); // wait a bit for document to get parsed
        return { ext, doc, editor };
    } 
    catch (e) {
        console.error(e);
    }
}

/**
 * @public Set the content of an opened text document
 * 
 * @param doc - The text document
 * @param editor - The editor window where this text document is opened on
 * @param content - The content to set
 * @returns A promise that resolves with a value indicating if the edits could be applied
 */
export async function setContent(
    doc: vscode.TextDocument, 
    editor: vscode.TextEditor, 
    content: string
): Promise<boolean> {
    const all = new vscode.Range(
        doc.positionAt(0),
        doc.positionAt(doc.getText().length)
    );
    return editor.edit(v => v.replace(all, content));
}

/**
 * @public Closes the window where a file is opened on
 * @param file - The opened file URI 
 */
export async function closeFileWindow(file: vscode.Uri): Promise<void> {
    const tabs: vscode.Tab[] = vscode.window.tabGroups.all.map(tg => tg.tabs).flat();
    const index = tabs.findIndex(
        tab => tab.input instanceof vscode.TabInputText && tab.input.uri.path === file.path
    );
    if (index !== -1) {
        await vscode.window.tabGroups.close(tabs[index]);
    }
}

/**
 * @param startLine - The start line
 * @param sstartChar - The start character
 * @param eendLine - The end line
 * @param endChar - The end haracter
 * @returns A instance of vscode Range object
 */
export function toRange(
    startLine: number, 
    startChar: number, 
    eendLine: number, 
    endChar: number
) {
    const start = new vscode.Position(startLine, startChar);
    const end = new vscode.Position(eendLine, endChar);
    return new vscode.Range(start, end);
}