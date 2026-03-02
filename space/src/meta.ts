import "@metafor/meta"

export default MetaFor("space")
  .brane((field) => ({}))
  .superposition({
    "подписка на изменения состояний": {},
  })
  .mass({
    onStateChange: undefined,
  })
  .processes((proces) => ({
    "подписка на изменения состояний": proces()
      .action(() => {
        // console.log("i")
      })
      .success(() => ({}))
      .error(() => ({})),
  }))
  .reactions()
  .bulk()