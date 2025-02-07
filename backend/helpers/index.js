import { dryrun } from "@permaweb/aoconnect"
import { AO } from "../constants.js";
import fs from "fs";

export const assetSrc = fs.readFileSync("./lua/atomicasset.lua", "utf8");


export async function readHandler(args) {
	const tags = [{ name: 'Action', value: args.action }];
	if (args.tags) tags.push(...args.tags);

	const response = await dryrun({
		process: args.processId,
		tags: tags,
		data: JSON.stringify(args.data || {}),
	});

	if (response.Messages && response.Messages.length) {
		if (response.Messages[0].Data) {
			return JSON.parse(response.Messages[0].Data);
		} else {
			if (response.Messages[0].Tags) {
				return response.Messages[0].Tags.reduce((acc, item) => {
					acc[item.name] = item.value;
					return acc;
				}, {});
			}
		}
	}
}


export async function getProfileByWalletAddress(args) {
	const emptyProfile = {
		id: null,
		walletAddress: args.address,
		displayName: null,
		username: null,
		bio: null,
		avatar: null,
		banner: null,
	};

	try {
		const profileLookup = await readHandler({
			processId: AO.profileRegistry,
			action: 'Get-Profiles-By-Delegate',
			data: { Address: args.address },
		});

		let activeProfileId;
		if (profileLookup && profileLookup.length > 0 && profileLookup[0].ProfileId) {
			activeProfileId = profileLookup[0].ProfileId;
		}

		if (activeProfileId) {
			const fetchedProfile = await readHandler({
				processId: activeProfileId,
				action: 'Info',
				data: null,
			});

			if (fetchedProfile) {
				return {
					id: activeProfileId,
					walletAddress: fetchedProfile.Owner || null,
					displayName: fetchedProfile.Profile.DisplayName || null,
					username: fetchedProfile.Profile.UserName || null,
					bio: fetchedProfile.Profile.Description || null,
					avatar: fetchedProfile.Profile.ProfileImage || null,
					banner: fetchedProfile.Profile.CoverImage || null,
				};
			} else return emptyProfile;
		} else return emptyProfile;
	} catch (e) {
		throw new Error(e);
	}
}