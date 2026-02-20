import React, { useState, useEffect } from "react"
import { Box, Text, useInput, useApp } from "ink"
import {
  Header,
  InputField,
  Preview,
  HelpList,
  MenuList,
  Footer,
  UpdateModal,
} from "./index"
import { useCursor, useScreenSize, useCleanup, useVersionCheck } from "../hooks"
import type { Field, View, MenuItem } from "../types"
import packageJson from "../../../package.json"
import { runSelfUpdate } from "../../update"

interface Props {
  onSubmit: (name: string, description: string, dir: string) => void
}

type UpdateButton = "update" | "later"

export default function Form({ onSubmit }: Props) {
  const { exit: exitApp } = useApp()
  const { leftWidth, height, width } = useScreenSize()
  useCleanup()

  const [field, setField] = useState<Field>("name")
  const [name, setName] = useState("")
  const [desc, setDesc] = useState("")
  const [dir, setDir] = useState("")
  const [input, setInput] = useState("")
  const [view, setView] = useState<View>("input")
  const [selectedItem, setSelectedItem] = useState(0)
  const cursorVisible = useCursor(view)

  // Обновление
  const justUpdated = process.env.CREATE_METAFOR_JUST_UPDATED === "true"
  const { latestVersion, isLoading, hasUpdate } = useVersionCheck(packageJson.version, justUpdated)
  const [showUpdateModal, setShowUpdateModal] = useState(false)
  const [selectedButton, setSelectedButton] = useState<UpdateButton>("update")
  const [isUpdating, setIsUpdating] = useState(false)
  const [updateError, setUpdateError] = useState<string | null>(null)

  // Показываем модальное окно если есть обновление (но не сразу после обновления)
  useEffect(() => {
    if (hasUpdate && !showUpdateModal && !isUpdating && !justUpdated) {
      setShowUpdateModal(true)
    }
  }, [hasUpdate])

  // Скрываем ошибку через 5 секунд
  useEffect(() => {
    if (updateError) {
      const timer = setTimeout(() => setUpdateError(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [updateError])

  const getHelpItems = (): MenuItem[] => [
    { key: "Enter", label: "далее / пропустить" },
    { key: "Tab", label: "далее" },
    { key: "Backspace", label: "стереть" },
    { key: "Esc", label: "выход" },
    { key: "?", label: "помощь" },
    { key: "/", label: "меню" },
  ]

  const getMenuItems = (): MenuItem[] => [
    { key: "1", label: "Мета для...", action: () => { if (field !== "name") { setField("name"); setInput(name); } } },
    { key: "2", label: "Мета описание", action: () => { if (field !== "desc") { setField("desc"); setInput(desc); } } },
    { key: "3", label: "Мета директория", action: () => { if (field !== "dir") { setField("dir"); setInput(dir); } } },
    { key: "q", label: "выход", action: () => exitApp() },
  ]

  useInput((inputChar, key) => {
    // Если есть ошибка — любая клавиша закрывает сообщение
    if (updateError) {
      setUpdateError(null)
      return
    }

    // Обработка модального окна обновления
    if (showUpdateModal) {
      // Навигация между кнопками
      if (key.leftArrow || key.rightArrow || inputChar === "h" || inputChar === "л" || inputChar === "j" || inputChar === "о") {
        setSelectedButton((prev) => prev === "update" ? "later" : "update")
        return
      }

      // Tab для переключения
      if (key.tab) {
        setSelectedButton((prev) => prev === "update" ? "later" : "update")
        return
      }

      // Enter для выбора
      if (key.return) {
        if (selectedButton === "update") {
          setIsUpdating(true)
          setShowUpdateModal(false)

          runSelfUpdate().then((result) => {
            setIsUpdating(false)
            if (result.ok) {
              setUpdateError(null)
              console.log("\n✅ Обновление выполнено. Кеш npx очищен, перезапустите команду.\n")
              process.exit(0)
            } else {
              setUpdateError(`Не удалось обновить (${result.error}). Попробуйте вручную: ${result.command.label}`)
              setShowUpdateModal(true)
            }
          })
        } else {
          setShowUpdateModal(false)
        }
        return
      }

      // Esc — позже
      if (key.escape) {
        setShowUpdateModal(false)
        return
      }

      return
    }

    // Основной режим
    if (key.escape) {
      exitApp()
      return
    }

    if (inputChar === "?" || inputChar === "/") {
      if (view === "input") {
        setView(inputChar === "?" ? "help" : "menu")
        setSelectedItem(0)
      } else {
        setView("input")
      }
      return
    }

    // Навигация в меню/помощи (vim-like + стрелки)
    if (view !== "input") {
      const items = view === "help" ? getHelpItems() : getMenuItems()

      // vim-like навигация (j/k и русские о/л)
      if (key.upArrow || inputChar === "k" || inputChar === "л") {
        setSelectedItem((prev) => (prev > 0 ? prev - 1 : items.length - 1))
        return
      }

      if (key.downArrow || inputChar === "j" || inputChar === "о") {
        setSelectedItem((prev) => (prev < items.length - 1 ? prev + 1 : 0))
        return
      }

      // Enter — выбор пункта меню
      if (key.return && view === "menu") {
        const item = items[selectedItem]
        if (item?.action) {
          item.action()
          setView("input")
        }
        return
      }

      // Выбор пункта меню по клавише
      if (view === "menu" && inputChar) {
        const item = items.find((m) => m.key === inputChar)
        if (item?.action) {
          item.action()
          setView("input")
        }
      }

      return
    }

    // Ввод в режиме input
    if (key.return) {
      if (field === "name") {
        setName(input.trim())
        setField("desc")
        setInput("")
      } else if (field === "desc") {
        setDesc(input.trim() || `MetaFor ${name}`)
        setField("dir")
        setInput("")
      } else if (field === "dir") {
        onSubmit(name, desc, input.trim() || ".")
      }
      return
    }

    if (key.tab) {
      if (field === "name") {
        setName(input.trim())
        setField("desc")
        setInput("")
      } else if (field === "desc") {
        setDesc(input.trim() || `MetaFor ${name}`)
        setField("dir")
        setInput("")
      } else if (field === "dir") {
        onSubmit(name, desc, input.trim() || ".")
      }
      return
    }

    if (key.backspace || key.delete) {
      setInput((prev: string) => prev.slice(0, -1))
      return
    }

    if (inputChar && /[\p{L}\p{N}\s\-_./]/u.test(inputChar)) {
      setInput((prev: string) => prev + inputChar)
    }
  })

  const renderCursor = () => {
    if (view !== "input") {
      return cursorVisible ? "░" : " "
    }
    return cursorVisible ? "▓" : " "
  }

  const isInteractive = view !== "input"
  const borderColor = isInteractive ? "white" : "gray"

  // Если показано модальное окно — скрываем основной контент
  const showOverlay = showUpdateModal || updateError

  return (
    <Box flexDirection="column" height={height}>
      <Header field={field} view={view} />

      {!showOverlay ? (
        <Box flexGrow={1}>
          <InputField
            input={input}
            cursor={renderCursor()}
            isActive={view === "input"}
            width={leftWidth}
          />

          <Box
            flexGrow={1}
            flexDirection="column"
            borderStyle="single"
            borderColor={borderColor}
            marginLeft={1}
            paddingLeft={1}
          >
            {view === "input" ? (
              <Preview name={name} desc={desc} dir={dir} />
            ) : view === "help" ? (
              <HelpList items={getHelpItems()} selectedItem={selectedItem} />
            ) : (
              <MenuList items={getMenuItems()} selectedItem={selectedItem} />
            )}
          </Box>
        </Box>
      ) : (
        <Box flexGrow={1} justifyContent="center" alignItems="center">
          {showUpdateModal ? (
            <UpdateModal
              currentVersion={packageJson.version}
              latestVersion={latestVersion || ""}
              selectedButton={selectedButton}
            />
          ) : (
            <Box
              flexDirection="column"
              borderStyle="round"
              borderColor="red"
              padding={1}
              width={52}
            >
              <Box justifyContent="center" marginBottom={1}>
                <Text bold color="red">Ошибка обновления</Text>
              </Box>
              <Box marginBottom={1}>
                <Text>{updateError}</Text>
              </Box>
              <Box justifyContent="center">
                <Text dimColor>Нажмите любую клавишу...</Text>
              </Box>
            </Box>
          )}
        </Box>
      )}

      <Footer />
    </Box>
  )
}
