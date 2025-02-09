import fs from "fs"
import { spawn, message, createDataItemSigner } from "@permaweb/aoconnect"
import { AO } from "../constants.js"
import Arweave from "arweave"

const title = "The Buffers"
const description = "Buffers are a group of agents born out of data stored on Arweave"
const thumbnail = "lp51N4FWXSHvwQQ-Qz3m7Ybj0t75Tq2Y7MDtb5xnfAI"
const banner = "Fr6Z9vYSXG8YsN-Rn1BpNCqGK_QDJhqFUvglZ-N12Zg"
const dateCreated = `${new Date().getTime()}`
const dateUpdated = `${new Date().getTime()}`

const collectionSrc = fs.readFileSync("./lua/collection.lua", "utf8")

const arindiaWallet = "xCP4RHPlr2ti-Wl8ph2Zz_Su4AOpVcXM76y6EuHvpDQ"
const arindiaProfile = "auJlN8sZUFTi4YhN_z4wzsw9VZKjLnFaMQ0ymfbUYGU"

const arweave = Arweave.init({
    host: "arweave.net",
    port: 443,
    protocol: "https"
})

const wallet = fs.readFileSync("./wallet.json", "utf8")
const walletData = JSON.parse(wallet)
const signer = createDataItemSigner(walletData)

const address = await arweave.wallets.getAddress(walletData)


const collectionId = await spawn({
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
        { name: "Creator", value: arindiaWallet },
        { name: "Profile-Creator", value: arindiaProfile },
        { name: "Action", value: "Add-Collection" },
    ]
})
console.log("collectionId", collectionId)

while (true) {
    try {
        const msg = await message({
            process: collectionId,
            data: collectionSrc.replaceAll("<NAME>", title).replaceAll("<DESCRIPTION>", description).replaceAll("<CREATOR>", arindiaProfile).replaceAll("<THUMBNAIL>", thumbnail).replaceAll("<BANNER>", banner).replaceAll("<DATECREATED>", dateCreated).replaceAll("<LASTUPDATE>", dateUpdated),
            signer: signer,
            tags: [
                { name: "Action", value: "Eval" },
            ]
        })
        console.log(msg)
        break
    } catch (error) {
        console.log(error)
    } finally {
        await new Promise(resolve => setTimeout(resolve, 1000))
    }
}
