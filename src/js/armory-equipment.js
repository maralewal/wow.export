const { SHOULDER_SLOT_L, SHOULDER_SLOT_R } = require('./wow/EquipmentSlots');

const parseArmoryEquipment = items => {
	const equipment = {};
	const appearanceModifiers = {};
	for (const item of items ?? []) {
		const slot = item.internal_slot_id + 1;
		if (!Number.isInteger(slot) || !Number.isSafeInteger(item.id) || item.id < 1)
			continue;
		equipment[slot] = item.id;
		if (Number.isSafeInteger(item.item_appearance_modifier_id) && item.item_appearance_modifier_id > 0)
			appearanceModifiers[slot] = item.item_appearance_modifier_id;

		if (slot === SHOULDER_SLOT_L && Number.isSafeInteger(item.secondary_id) && item.secondary_id > 0) {
			equipment[SHOULDER_SLOT_R] = item.secondary_id;
			if (Number.isSafeInteger(item.secondary_item_appearance_modifier_id) && item.secondary_item_appearance_modifier_id > 0)
				appearanceModifiers[SHOULDER_SLOT_R] = item.secondary_item_appearance_modifier_id;
		}
	}
	if (equipment[SHOULDER_SLOT_L] && equipment[SHOULDER_SLOT_R] === undefined) {
		equipment[SHOULDER_SLOT_R] = equipment[SHOULDER_SLOT_L];
		if (appearanceModifiers[SHOULDER_SLOT_L] !== undefined)
			appearanceModifiers[SHOULDER_SLOT_R] = appearanceModifiers[SHOULDER_SLOT_L];
	}
	return { equipment, appearanceModifiers };
};

module.exports = { parseArmoryEquipment };
