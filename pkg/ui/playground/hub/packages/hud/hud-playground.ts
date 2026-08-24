document.documentElement.dataset.uiPlayground = "starting"
document.documentElement.dataset.uiPlaygroundPage = "hud"
document.documentElement.dataset.hudPlayground = "informational"

const exportsList = document.getElementById("hud-public-surfaces")
if (!(exportsList instanceof HTMLUListElement)) throw new Error("HUD public surface list is missing")

for (const label of [
  "HUD-окно и боковые вкладки",
  "Перемещение, изменение размера и docking рамки",
  "Read-only timeline",
]) {
  const item = document.createElement("li")
  item.textContent = label
  exportsList.append(item)
}

document.documentElement.dataset.uiPlayground = "ready"
