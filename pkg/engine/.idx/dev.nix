{ pkgs, ... }: {
  channel = "unstable";
  packages = [ pkgs.bun ];
  idx.extensions = [
    "biomejs.biome"
    "esbenp.prettier-vscode"
    "kamikillerto.vscode-colorize"
    "mhutchie.git-graph"
    "oven.bun-vscode"
  ];
  idx.workspace.onCreate = {
    install-deps = "bun install";
  };
  idx.previews = {
    enable = true;
    previews = {
      web = {
        command = [ "bun" "run" "--hot" "server.ts" ];
        manager = "web";
        env = {
          PORT = "$PORT"; # Явно передаем переменную серверу
        };
      };
    };
  };
}