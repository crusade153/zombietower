class_name TowerSave
extends RefCounted

static func fresh() -> Dictionary:
	return {"v": 1, "rarityVersion": 2, "seed": 20260101, "coins": 0, "nextUid": 2,
		"weapons": [{"uid": 1, "kind": "bat", "rarity": 0, "level": 0}],
		"equipped": [1, null, null], "lastSafe": 0, "resumeSafe": 0, "openedChests": [],
		"bossSanctuaryUnlocked": false, "resumeAtBoss": false, "finalBossDefeated": false,
		"best": 0, "cleared": false, "loop": 0, "difficulty": "normal", "muted": false}

static func path() -> String:
	# Development stays in this workspace. Exported games use the normal Godot save folder.
	return "res://saves/save.json" if OS.has_feature("editor") else "user://save.json"

static func load_game() -> Dictionary:
	if FileAccess.file_exists(path()):
		var raw = JSON.parse_string(FileAccess.get_file_as_string(path()))
		if raw is Dictionary:
			return normalize(raw)
	return fresh()

static func normalize(raw: Dictionary) -> Dictionary:
	var s = fresh()
	for key in s:
		if raw.has(key):
			s[key] = raw[key]
	s.lastSafe = clampi(str(s.lastSafe).to_int(), 0, 10)
	s.resumeSafe = clampi(str(raw.get("resumeSafe", s.lastSafe)).to_int(), 0, s.lastSafe)
	s.coins = maxi(0, str(s.coins).to_int())
	s.loop = maxi(0, str(s.loop).to_int())
	s.best = maxi(s.lastSafe, str(s.best).to_int())
	s.difficulty = s.difficulty if s.difficulty in ["easy", "normal", "hard"] else "normal"
	var valid: Array = []
	var ids: Array = []
	var highest_uid = 0
	if s.weapons is Array:
		for entry in s.weapons:
			if not entry is Dictionary or entry.get("kind", "") not in ["bat", "axe", "whip", "pistol", "rifle", "shotgun"]:
				continue
			var uid = str(entry.get("uid", 0)).to_int()
			if uid <= 0 or uid in ids or valid.size() >= 12:
				continue
			var rarity = clampi(str(entry.get("rarity", 0)).to_int(), 0, 6)
			if not raw.has("rarityVersion") and rarity == 3:
				rarity = 4
			valid.append({"uid": uid, "kind": entry.kind, "rarity": rarity, "level": clampi(str(entry.get("level", 0)).to_int(), 0, 10)})
			ids.append(uid)
			highest_uid = maxi(uid, highest_uid)
	if valid.is_empty():
		valid = fresh().weapons
		ids = [1]
		highest_uid = 1
	s.weapons = valid
	s.nextUid = maxi(highest_uid + 1, str(s.nextUid).to_int())
	var equipped: Array = [null, null, null]
	if s.equipped is Array:
		for i in range(mini(3, s.equipped.size())):
			var uid = str(s.equipped[i]).to_int()
			if uid in ids and not uid in equipped:
				equipped[i] = uid
	if equipped == [null, null, null]:
		equipped[0] = valid[0].uid
	s.equipped = equipped
	var chests: Array = []
	if s.openedChests is Array:
		for entry in s.openedChests:
			var floor_number = str(entry).to_int()
			if floor_number >= 1 and floor_number <= 10 and not floor_number in chests:
				chests.append(floor_number)
	s.openedChests = chests
	s.rarityVersion = 2
	s.resumeAtBoss = bool(s.resumeAtBoss) and bool(s.bossSanctuaryUnlocked)
	if not raw.has("rarityVersion") and s.cleared:
		s.finalBossDefeated = true
	return s

static func write(s: Dictionary) -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(path().get_base_dir()))
	var file = FileAccess.open(path(), FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(s, "\t"))

static func weapon(s: Dictionary, uid) -> Dictionary:
	for w in s.weapons:
		if w.uid == uid:
			return w
	return {}
