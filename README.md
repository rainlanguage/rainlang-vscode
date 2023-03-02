# Rain Language Support for Visual Studio Code (vscode extention)

Rain language support for vscode. Uses Rain Language Services from [rainlang](https://github.com/rainprotocol/rainlang) repo under the hood.
<br>

## Functionality

Rain Language Server works for rain files with `.rain`, `.rainlang` or `.rl` extentions. It has the following language features:
- Completions
- Diagnostics regenerated on each file change or configuration change
- Hovers

It also includes an End-to-End test.
<br>

## Tutorial

After installing the extention from vscode marketplace, if `.vscode/settings.json` does not already exists in your workspace, create it and add the following property:
```json
rainlang.opmeta: "opmeta-in-hex-string"
```
<br>

## Structure

```
.
├── client // Rain Language Client
│   ├── src
│   │   ├── test // End to End tests for Language Client / Server
│   │   └── extension.ts // Language Client entry point
├── package.json // The extension manifest.
└── server // Rain Language Server
    └── src
        └── server.ts // Language Server entry point
```
<br>

## Developers Guide

- Run `npm install` in this folder or `nix-shell` if you have nix installed on your machine. This installs all necessary npm modules in both the client and server folder
- Open VS Code on this folder.
- Press Ctrl+Shift+B to start compiling the client and server in [watch mode](https://code.visualstudio.com/docs/editor/tasks#:~:text=The%20first%20entry%20executes,the%20HelloWorld.js%20file.).
- Switch to the Run and Debug View in the Sidebar (Ctrl+Shift+D).
- Select `Launch Client` from the drop down (if it is not already).
- Press ▷ to run the launch config (F5).
- In the [Extension Development Host](https://code.visualstudio.com/api/get-started/your-first-extension#:~:text=Then%2C%20inside%20the%20editor%2C%20press%20F5.%20This%20will%20compile%20and%20run%20the%20extension%20in%20a%20new%20Extension%20Development%20Host%20window.) instance of VSCode, open or create a workscpace, create a new workspace and then create `.vscode/settings.json` and add the following:
```json
{
  "rainlang.opmeta": "your-opmeta-in-hex-string"
}
```
then create a document that ends with `.rain` to start the language mode for that. (save these to have them ready for future).
  - Start typing your expression and get the completion for opcodes.
  - hover over some of the opcodes or values to get hover items.
  - The diagnostics will be generated automatically.
