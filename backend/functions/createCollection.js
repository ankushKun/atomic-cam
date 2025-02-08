import fs from "fs"
import { spawn, message, createDataItemSigner } from "@permaweb/aoconnect"
import { AO } from "../constants.js"
import Arweave from "arweave"

const title = "My Collection"
const description = "My Collection Description"
const thumbnail = "GmvxbZgH7PC70Pz1z_2C6CSR8BFakIJBHXXdD4f7lts"
const banner = "m18Z0R_93wMXagkftgYJNNEy-E0bjylED0mjZwPnnEE"
const dateCreated = new Date().getTime()
const dateUpdated = new Date().getTime()

const arweave = Arweave.init({
    host: "arweave.net",
    port: 443,
    protocol: "https"
})

const wallet = fs.readFileSync("./wallet.json", "utf8")
const walletData = JSON.parse(wallet)
const signer = createDataItemSigner(walletData)

const address = await arweave.wallets.getAddress(walletData)


const collectionId = spawn({
    module: AO.module,
    scheduler: AO.scheduler,
    signer: signer,
    tags: [
        { name: "Title", value: title },
        { name: "Description", value: description },
        { name: "Thumbnail", value: thumbnail },
        { name: "Banner", value: banner },
        { name: "Date Created", value: dateCreated },
        { name: "Date Updated", value: dateUpdated },

    ]
})

console.log(collectionId)
