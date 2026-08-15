{
  description = "Adds every available Amex and Chase offer to your cards on a schedule";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    bun2nix.url = "github:nix-community/bun2nix";
    bun2nix.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
    bun2nix,
  }: let
    overlays.default = final: _: {
      offer-adder = final.callPackage ./nix/offer-adder.nix {src = ./.;};
    };
  in
    # Linux only: the deliverable is a systemd timer, and the package pulls in
    # xvfb-run and a Linux Chromium.
    (flake-utils.lib.eachSystem ["x86_64-linux" "aarch64-linux"] (
      system: let
        pkgs = import nixpkgs {
          inherit system;
          # bun2nix's overlay puts `bun2nix` — the CLI plus its `.hook` and
          # `.fetchBunDeps` passthrus — into the package set so the derivation
          # can pull it in through callPackage.
          overlays = [bun2nix.overlays.default overlays.default];
        };
      in {
        packages.default = pkgs.offer-adder;
        packages.offer-adder = pkgs.offer-adder;

        # `nix flake check` builds the package, which runs `bun test` in its
        # check phase — the same unit tests CI runs.
        checks.default = pkgs.offer-adder;

        devShells.default = pkgs.mkShell {
          packages = [
            pkgs.bun
            pkgs.bun2nix
            pkgs.biome
            pkgs.bitwarden-cli
            pkgs.playwright-driver.browsers
            pkgs.xvfb-run
          ];
          # Point the dev shell's playwright at the same browsers the package
          # uses, so `bun apps/offer-adder/src/main.ts` behaves the same in the
          # shell as it does under the service.
          PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
          PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
        };
      }
    ))
    // {
      inherit overlays;
      nixosModules.default = import ./nix/module.nix self;
    };
}
