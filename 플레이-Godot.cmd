@echo off
setlocal
cd /d "%~dp0"
if exist "godot\builds\FrostTower.exe" (
  start "" "godot\builds\FrostTower.exe"
) else (
  start "" ".tools\godot\Godot_v4.7.2-stable_win64.exe" --path "godot"
)
