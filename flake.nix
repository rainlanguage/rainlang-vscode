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
        install = rainix.mkTask.${system} {
          name = "install";
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
      };

      # For `nix develop`:
      devShell = pkgs.mkShell {
        nativeBuildInputs = [
          rainix.rust-toolchain.${system}
          rainix.rust-build-inputs.${system}
          rainix.node-build-inputs.${system}
        ] ++ (with pkgs; [ 
          wasm-bindgen-cli
        ]);
      };
    }
  );
}