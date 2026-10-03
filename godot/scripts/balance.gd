class_name TowerBalance
extends RefCounted

static var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/balance.json"))

static func damage(w: Dictionary) -> float:
	return float(data.weapons[w.kind].dmg) * float(data.rarities[int(w.rarity)].mult) * (1.0 + float(w.level) * 0.12)

static func cost(w: Dictionary) -> int:
	return int(round(8.0 * pow(1.22, float(w.level)) * float(data.rarities[int(w.rarity)].cost)))

static func sell_price(w: Dictionary) -> int:
	var total = int(data.economy.sellValue[int(w.rarity)])
	var spent = 0
	for level in range(int(w.level)):
		var old = w.duplicate()
		old.level = level
		spent += cost(old)
	return total + int(spent * 0.5)

static func odds(floor_number: int, boss: bool = false) -> Array:
	var result: Array = []
	var t = clampf((floor_number - 1) / 9.0, 0, 1)
	for i in range(7):
		result.append(lerpf(data.chest.first[i], data.chest.last[i], t))
	if boss:
		for i in range(3):
			result[3] += result[i]
			result[i] = 0
	return result

static func roll(floor_number: int, rng: RandomNumberGenerator, boss: bool = false) -> Dictionary:
	var pick = rng.randf() * 100.0
	var rarity = 6
	var weights = odds(floor_number, boss)
	for i in range(7):
		pick -= weights[i]
		if pick < 0:
			rarity = i
			break
	var kinds = data.weapons.keys()
	return {"kind": kinds[rng.randi_range(0, kinds.size() - 1)], "rarity": rarity, "level": 0}

static func tier(level: int) -> int:
	return 10 if level >= 10 else 7 if level >= 7 else 4 if level >= 4 else 1 if level >= 1 else 0

static func appearance(level: int) -> String:
	return {0: "기본형", 1: "강철 보강", 4: "룬 각인", 7: "플라즈마", 10: "황금 각성"}[tier(level)]
