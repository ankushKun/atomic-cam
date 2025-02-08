import fs from "fs"
import { spawn, message, createDataItemSigner } from "@permaweb/aoconnect"
import { AO } from "../constants.js"
import Arweave from "arweave"

const title = "My Collection"
const description = "My Collection Description"
const thumbnail = "GmvxbZgH7PC70Pz1z_2C6CSR8BFakIJBHXXdD4f7lts"
const banner = "m18Z0R_93wMXagkftgYJNNEy-E0bjylED0mjZwPnnEE"
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
