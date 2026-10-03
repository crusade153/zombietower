extends CanvasLayer

var game
var root: Control
var overlay: Control
var hud: Control
var status: Label
var stage_label: Label
var boss_label: Label
var toast_label: Label
var context: HBoxContainer
var slots: HBoxContainer
var selected = 1
var toast_timer = 0.0
var mode = ""
var directions: Dictionary = {}
var font: SystemFont

func setup(g) -> void:
	game = g
	font = SystemFont.new()
	font.font_names = PackedStringArray(["Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR"])
	root = Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var theme = Theme.new()
	theme.default_font = font
	theme.default_font_size = 18
	root.theme = theme
	add_child(root)
	hud = Control.new()
	hud.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	hud.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(hud)
	status = label("", 24)
	status.position = Vector2(28, 22)
	status.size = Vector2(260, 100)
	hud.add_child(status)
	stage_label = label("", 23)
	stage_label.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	stage_label.position = Vector2(-170, 24)
	stage_label.size = Vector2(340, 42)
	stage_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hud.add_child(stage_label)
	boss_label = label("", 20)
	boss_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	boss_label.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	boss_label.position = Vector2(-260, 86)
	boss_label.size = Vector2(520, 80)
	boss_label.add_theme_color_override("font_color", Color("ffc794"))
	hud.add_child(boss_label)
	var pause = button("일시정지", game.pause_game)
	pause.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	pause.position = Vector2(-145, 22)
	pause.size = Vector2(120, 44)
	hud.add_child(pause)
	context = HBoxContainer.new()
	context.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	context.position = Vector2(-200, -84)
	context.size = Vector2(400, 58)
	context.alignment = BoxContainer.ALIGNMENT_CENTER
	hud.add_child(context)
	context.add_child(button("E · 대장간", forge))
	context.add_child(button("F · 보물상자", chest))
	slots = HBoxContainer.new()
	slots.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT)
	slots.position = Vector2(-445, -310)
	slots.size = Vector2(420, 64)
	hud.add_child(slots)
	for i in range(3):
		var btn = button("", func(): game.slot = i; game.refresh_weapon())
		btn.custom_minimum_size = Vector2(130, 56)
		slots.add_child(btn)
	_build_touch_controls()
	toast_label = label("", 19)
	toast_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	toast_label.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	toast_label.position = Vector2(-400, -380)
	toast_label.size = Vector2(800, 50)
	root.add_child(toast_label)
	var notes = label("WASD 이동 · Space 점프 · J 공격 · Q 물대포 · 우클릭 드래그 시점", 13)
	notes.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	notes.position = Vector2(-360, -22)
	notes.size = Vector2(720, 20)
	notes.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hud.add_child(notes)

func label(text: String, size: int = 18) -> Label:
	var n = Label.new()
	n.text = text
	n.add_theme_font_size_override("font_size", size)
	n.add_theme_color_override("font_color", Color("e4f5ff"))
	n.add_theme_color_override("font_shadow_color", Color("111c31"))
	n.add_theme_constant_override("shadow_offset_y", 2)
	return n

func button(text: String, callback: Callable) -> Button:
	var n = Button.new()
	n.text = text
	n.custom_minimum_size = Vector2(100, 44)
	var normal = StyleBoxFlat.new()
	normal.bg_color = Color("233b56")
	normal.border_color = Color("6a9abc")
	normal.set_border_width_all(1)
	normal.set_corner_radius_all(8)
	normal.content_margin_left = 16
	normal.content_margin_right = 16
	normal.content_margin_top = 8
	normal.content_margin_bottom = 8
	var hover = normal.duplicate()
	hover.bg_color = Color("386081")
	var pressed = normal.duplicate()
	pressed.bg_color = Color("507e9e")
	n.add_theme_stylebox_override("normal", normal)
	n.add_theme_stylebox_override("hover", hover)
	n.add_theme_stylebox_override("pressed", pressed)
	n.pressed.connect(callback)
	return n

func _panel(title_text: String, width: float = 620) -> VBoxContainer:
	close()
	overlay = Control.new()
	overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_child(overlay)
	var shade = ColorRect.new()
	shade.color = Color(0.025, 0.06, 0.12, 0.72)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	overlay.add_child(shade)
	var center = CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	overlay.add_child(center)
	var panel = PanelContainer.new()
	panel.custom_minimum_size.x = width
	var style = StyleBoxFlat.new()
	style.bg_color = Color("15283f")
	style.border_color = Color("729cb6")
	style.set_border_width_all(2)
	style.set_corner_radius_all(14)
	style.content_margin_left = 28
	style.content_margin_right = 28
	style.content_margin_top = 24
	style.content_margin_bottom = 24
	panel.add_theme_stylebox_override("panel", style)
	center.add_child(panel)
	var column = VBoxContainer.new()
	column.add_theme_constant_override("separation", 12)
	panel.add_child(column)
	var title_label = label(title_text, 30)
	column.add_child(title_label)
	return column

func close() -> void:
	if overlay:
		overlay.queue_free()
		overlay = null
	mode = ""
	touch_release()

func touch_release() -> void:
	directions.clear()
	game.touch_move = Vector2.ZERO
	game.touch_attack = false

func title() -> void:
	game.state = "title"
	var column = _panel("FROST TOWER\n얼음 성채", 580)
	mode = "title"
	column.add_child(label("용암 군단을 뚫고, 빙왕좌를 해방하라", 20))
	column.add_child(label("7가지 무기 등급 · 무한 탄약 · 저렴한 강화", 15))
	var diff = HBoxContainer.new()
	column.add_child(diff)
	for entry in [["easy", "쉬움"], ["normal", "보통"], ["hard", "어려움"]]:
		diff.add_child(button(entry[1] + (" ✓" if game.save.difficulty == entry[0] else ""), func(): game.save.difficulty = entry[0]; game.persist(); game.build_world(); title()))
	column.add_child(button("모험 시작" if int(game.save.lastSafe) == 0 else "이어서 올라가기", func(): game.start_game()))
	column.add_child(button("시작 층 선택", floors))
	column.add_child(button("새 모험", func(): game.start_game(true)))
	column.add_child(button("웹 버전 저장 파일 가져오기", import_save))
	column.add_child(label("코인 %s · 최고 클리어 %s층" % [game.save.coins, game.save.lastSafe], 16))

func pause_menu() -> void:
	var column = _panel("잠깐 쉬어가기")
	mode = "pause"
	column.add_child(button("계속하기", func(): game.state = "play"; close()))
	column.add_child(button("클리어한 층에서 시작", floors))
	column.add_child(button("소리 켜기" if game.save.muted else "소리 끄기", func(): game.save.muted = not game.save.muted; game.persist(); pause_menu()))
	column.add_child(button("타이틀로", title))

func floors() -> void:
	var column = _panel("시작 층 선택", 680)
	mode = "floors"
	column.add_child(label("클리어한 층의 안전구역에서 시작 · 무기와 코인 유지", 16))
	var grid = GridContainer.new()
	grid.columns = 3
	column.add_child(grid)
	for floor_number in range(11):
		var btn = button("출발 · 1층 도전" if floor_number == 0 else "%s층 안전구역" % floor_number, func(): game.restart_floor(floor_number))
		btn.disabled = floor_number > int(game.save.lastSafe)
		grid.add_child(btn)
	if game.save.bossSanctuaryUnlocked:
		column.add_child(button("최종 보스 직전 안전구역", func(): game.restart_floor(9, true)))
	column.add_child(button("돌아가기", func(): title() if game.state == "title" else pause_menu()))

func forge(uid: int = -1) -> void:
	if not game.safe and game.state != "modal":
		return
	game.state = "modal"
	if uid >= 0:
		selected = uid
	if TowerSave.weapon(game.save, selected).is_empty():
		selected = int(game.current_weapon().uid)
	var w = TowerSave.weapon(game.save, selected)
	var d = TowerBalance.data.weapons[w.kind]
	var r = TowerBalance.data.rarities[int(w.rarity)]
	var column = _panel("대장간 · %s 코인" % game.save.coins, 900)
	mode = "forge"
	var grid = GridContainer.new()
	grid.columns = 4
	column.add_child(grid)
	for item in game.save.weapons:
		var text = "%s %s +%s" % [TowerBalance.data.rarities[int(item.rarity)].name, TowerBalance.data.weapons[item.kind].name, item.level]
		grid.add_child(button(text, func(): forge(int(item.uid))))
	var name_label = label("%s %s +%s" % [r.name, d.name, w.level], 25)
	name_label.add_theme_color_override("font_color", Color(r.color))
	column.add_child(name_label)
	column.add_child(label("공격력 %s · %s" % [int(TowerBalance.damage(w)), d.desc], 18))
	column.add_child(label("외형: %s · +1 강철 / +4 룬 / +7 플라즈마 / +10 황금" % TowerBalance.appearance(int(w.level)), 16))
	var upgrade_btn = button("최대 강화" if int(w.level) == 10 else "강화 +%s  →  %s 코인" % [int(w.level) + 1, TowerBalance.cost(w)], func(): game.upgrade(selected); forge(selected))
	upgrade_btn.disabled = int(w.level) >= 10 or int(game.save.coins) < TowerBalance.cost(w)
	column.add_child(upgrade_btn)
	var row = HBoxContainer.new()
	column.add_child(row)
	for i in range(3):
		row.add_child(button("슬롯 %s에 장착" % (i + 1), func(): game.equip(selected, i); forge(selected)))
	var sell = button("판매 · %s 코인" % TowerBalance.sell_price(w), func(): game.sell_weapon(selected); selected = int(game.current_weapon().uid); forge(selected))
	sell.disabled = game.save.weapons.size() <= 1
	column.add_child(sell)
	column.add_child(button("닫기", func(): game.state = "play"; close()))

func chest() -> void:
	if not game.safe or game.safe_index == 0 or game.platform_data[game.active_safe_id].type == "sanctuary":
		return
	game.state = "modal"
	var column = _panel("%s층 보물상자" % game.safe_index, 820)
	mode = "chest"
	if game.save.openedChests.has(game.safe_index):
		column.add_child(label("이미 연 상자입니다 · 층마다 한 번만 획득", 18))
	else:
		var weights = TowerBalance.odds(game.safe_index, game.safe_index in [5, 10])
		var text = ""
		for i in range(7):
			text += "%s %s%%   " % [TowerBalance.data.rarities[i].name, int(round(weights[i]))]
		var chance_label = label(text, 14)
		chance_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		chance_label.custom_minimum_size.x = 740
		column.add_child(chance_label)
		column.add_child(button("상자 열기!", reveal_chest))
	column.add_child(button("닫기", func(): game.state = "play"; close()))

func reveal_chest() -> void:
	var w = game.open_chest()
	if w.is_empty():
		return
	var r = TowerBalance.data.rarities[int(w.rarity)]
	var column = _panel("새로운 무기 발견!", 680)
	var text = label("%s %s" % [r.name, TowerBalance.data.weapons[w.kind].name], 36)
	text.add_theme_color_override("font_color", Color(r.color))
	column.add_child(text)
	column.add_child(label("공격력 %s · %s" % [int(TowerBalance.damage(w)), "보관함이 가득 차 자동 판매" if int(w.uid) == -1 else "보관함에 추가되었습니다"], 18))
	selected = int(w.uid) if int(w.uid) > 0 else selected
	column.add_child(button("장비 · 강화", func(): forge(selected)))
	column.add_child(button("닫기", func(): game.state = "play"; close()))

func clear_menu() -> void:
	var column = _panel("얼음 성채 해방!", 700)
	mode = "clear"
	column.add_child(label("용암 군주 이그니스를 쓰러뜨렸습니다!", 22))
	column.add_child(label("처치 %s · 사망 %s · 코인 %s" % [game.kills, game.deaths, game.save.coins], 18))
	column.add_child(button("새 타워 · 무기와 코인 유지", game.new_tower))
	column.add_child(button("타이틀로", title))

func import_save() -> void:
	var dialog = FileDialog.new()
	dialog.file_mode = FileDialog.FILE_MODE_OPEN_FILE
	dialog.access = FileDialog.ACCESS_FILESYSTEM
	dialog.filters = PackedStringArray(["*.json ; 좀비 타워 저장 파일"])
	dialog.use_native_dialog = true
	root.add_child(dialog)
	dialog.file_selected.connect(func(path_name):
		var raw = JSON.parse_string(FileAccess.get_file_as_string(path_name))
		if not raw is Dictionary or str(raw.get("v", 0)).to_int() != 1 or not raw.get("weapons") is Array:
			toast("유효한 좀비 타워 저장 파일이 아닙니다")
		else:
			game.save = TowerSave.normalize(raw)
			game.persist()
			game.build_world()
			title()
			toast("무기·코인·클리어 기록을 가져왔습니다")
		dialog.queue_free())
	dialog.canceled.connect(dialog.queue_free)
	dialog.popup_centered_ratio(0.7)

func _build_touch_controls() -> void:
	var dpad = Control.new()
	dpad.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT)
	dpad.position = Vector2(24, -240)
	dpad.size = Vector2(210, 210)
	hud.add_child(dpad)
	for entry in [["↑", Vector2(0, 1), Vector2(70, 0)], ["↓", Vector2(0, -1), Vector2(70, 140)], ["←", Vector2(-1, 0), Vector2(0, 70)], ["→", Vector2(1, 0), Vector2(140, 70)]]:
		var btn = button(entry[0], func(): pass)
		btn.custom_minimum_size = Vector2(64, 64)
		btn.size = Vector2(64, 64)
		btn.position = entry[2]
		dpad.add_child(btn)
		btn.button_down.connect(func(): directions[entry[0]] = entry[1]; _move_touch())
		btn.button_up.connect(func(): directions.erase(entry[0]); _move_touch())
	var actions = Control.new()
	actions.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT)
	actions.position = Vector2(-300, -238)
	actions.size = Vector2(275, 210)
	hud.add_child(actions)
	var jump = button("점프", func(): game.touch_jump = true)
	jump.position = Vector2(145, 105)
	jump.size = Vector2(125, 94)
	actions.add_child(jump)
	var attack = button("공격", func(): pass)
	attack.position = Vector2(0, 20)
	attack.size = Vector2(125, 94)
	attack.button_down.connect(func(): game.touch_attack = true)
	attack.button_up.connect(func(): game.touch_attack = false)
	actions.add_child(attack)
	var water = button("Q · 물대포", game.use_water)
	water.position = Vector2(0, 132)
	water.size = Vector2(125, 65)
	actions.add_child(water)

func _move_touch() -> void:
	game.touch_move = Vector2.ZERO
	for value in directions.values():
		game.touch_move += value

func toast(text: String) -> void:
	toast_label.text = text
	toast_timer = 3.0

func update_hud() -> void:
	hud.visible = game.state != "title"
	status.text = "HP %s / 100\n● %s 코인\n물대포 %s" % [int(game.hero.hp), game.save.coins, game.water]
	stage_label.text = "최종 보스 준비" if game.safe and game.save.resumeAtBoss else "%s층 · 안전구역" % game.safe_index if game.safe else "%s층 · 얼음 성채" % game.band_stage
	context.visible = game.safe and game.state == "play"
	context.get_child(1).visible = game.safe_index > 0 and not game.save.resumeAtBoss and not game.save.openedChests.has(game.safe_index)
	boss_label.text = ""
	if game.final_battle:
		for mob in get_tree().get_nodes_in_group("monsters"):
			if mob.is_final() and not mob.dead:
				boss_label.text = "%s\nHP %s / %s · %s" % [mob.def.name, int(mob.hp), int(mob.max_hp), "2단계 폭주" if mob.phase == 2 else "1단계"]
	for i in range(3):
		var w = TowerSave.weapon(game.save, game.save.equipped[i])
		var btn = slots.get_child(i)
		btn.disabled = w.is_empty()
		btn.text = "%s · 비어 있음" % (i + 1) if w.is_empty() else "%s · %s +%s%s" % [i + 1, TowerBalance.data.weapons[w.kind].name, w.level, "  ∞" if TowerBalance.data.weapons[w.kind].kind == "gun" else ""]
		btn.modulate = Color("ffe3a1") if i == game.slot else Color.WHITE
	toast_timer = maxf(0, toast_timer - get_process_delta_time())
	toast_label.visible = toast_timer > 0
