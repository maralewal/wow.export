const STATE_MARKER = 'var characterProfileInitialState = ';

const extractProfileState = html => {
	const marker = html.indexOf(STATE_MARKER);
	if (marker < 0)
		throw new Error('Armory page has no embedded character profile state.');
	const start = html.indexOf('{', marker + STATE_MARKER.length);
	if (start < 0)
		throw new Error('Armory profile state is malformed.');
	let depth = 0;
	let quoted = false;
	let escaped = false;
	for (let i = start; i < html.length; i++) {
		const char = html[i];
		if (quoted) {
			if (escaped)
				escaped = false;
			else if (char === '\\')
				escaped = true;
			else if (char === '"')
				quoted = false;
		} else if (char === '"') {
			quoted = true;
		} else if (char === '{') {
			depth++;
		} else if (char === '}' && --depth === 0) {
			return JSON.parse(html.slice(start, i + 1));
		}
	}
	throw new Error('Armory profile state is incomplete.');
};

const mergeVisibleGear = (appearance, profile) => {
	const gear = profile?.character?.gear;
	if (!gear || !Array.isArray(appearance.items))
		return { appearance, matchedSlots: 0, changedSlots: 0 };
	const visibleBySlot = new Map();
	for (const item of Object.values(gear)) {
		if (item?.slot?.type && Number.isSafeInteger(item.transmog?.item?.id))
			visibleBySlot.set(item.slot.type, item.transmog.item.id);
	}
	let matchedSlots = 0;
	let changedSlots = 0;
	const items = appearance.items.map(item => {
		if (!visibleBySlot.has(item.slot?.type))
			return item;
		matchedSlots++;
		const visibleID = visibleBySlot.get(item.slot.type);
		if (item.id === visibleID)
			return item;
		changedSlots++;
		const merged = { ...item, id: visibleID };
		delete merged.item_appearance_modifier_id;
		return merged;
	});
	return { appearance: { ...appearance, items }, matchedSlots, changedSlots };
};

module.exports = { extractProfileState, mergeVisibleGear };
