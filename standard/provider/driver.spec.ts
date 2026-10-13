import {expect,test} from "bun:test"
import {join} from "node:path"

for(const name of ["reuse","failure","abort","shared-abort","viewer","register","register-preview","register-timeout","register-configured","register-denied","register-unassigned","register-with-viewer"]){
  test(`native Provider lease ${name} connects the exact assigned peer before public clients receive it`,async()=>{
    const child=Bun.spawn([process.execPath,join(import.meta.dir,"spec/driver-fixture.ts"),name],{stdout:"pipe",stderr:"pipe",env:{PATH:process.env.PATH,TMPDIR:process.env.TMPDIR}})
    const output=new Response(child.stdout).text(),errors=new Response(child.stderr).text()
    expect(await child.exited,await errors).toBe(0)
    const result=JSON.parse((await output).trim())
    expect(result.passed).toBe(true)
    expect(result.sessions).toBe(0)
    expect(result.prompts).toBe(0)
  },10000)
}
