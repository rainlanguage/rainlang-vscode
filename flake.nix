{
  inputs = {
    flake-utils.url = "github:numtide/flake-utils";
    rainix.url = "github:rainprotocol/rainix";
  };

  outputs = { self, flake-utils, rainix }:

  flake-utils.lib.eachDefaultSystem (system:
    let
      pkgs = rainix.pkgs.${system};
    in rec {
      packages = {
        build = rainix.mkTask.${system} {
          name = "build";
          body = ''
            set -euxo pipefail
            npm install
          '';
          additionalBuildInputs = [
            pkgs.wasm-bindgen-cli
            rainix.rust-toolchain.${system}
            rainix.rust-build-inputs.${system}
            rainix.node-build-inputs.${system}
          ];
        };

        test = rainix.mkTask.${system} {
          name = "test";
          body = ''
            set -euxo pipefail
            npm test
          '';
          additionalBuildInputs = [
            rainix.node-build-inputs.${system}
          ];
        };
      };

      # For `nix develop`:
      devShell = pkgs.mkShell {
        nativeBuildInputs = [
          rainix.rust-toolchain.${system}
          rainix.rust-build-inputs.${system}
          rainix.node-build-inputs.${system}
        ] ++ (with pkgs; [ 
          wasm-bindgen-cli
          libgobject-2
          libglib-2
          libnss3
          libnssutil3
          libsmime3
          libnspr4
          libatk-1
          libatk-bridge-2
          libcups
          libgio-2
          libdrm
          libdbus-1
          libexpat
          libxcb
          libxkbcommon
          libatspi
          libX11
          libXcomposite
          libXdamage
          libXext
          libXfixes
          libXrandr
          libgbm
          libpango-1
          libcairo
          libasound
        ]);
      };
    }
  );
}