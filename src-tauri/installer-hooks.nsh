; Remove any legacy per-machine desktop shortcut left over from installs that used
; installMode "both" (which silently defaulted to perMachine and placed the shortcut
; under C:\Users\Public\Desktop rather than the current user's desktop).
; This runs before the new shortcut is created so upgrading users end up with
; exactly one shortcut in their own desktop.
!macro NSIS_HOOK_PREINSTALL
  Delete "$COMMON_DESKTOP\Kova.lnk"
!macroend

; ---------------------------------------------------------------------------
; Per-user PATH registration so `kova` works from Command Prompt / PowerShell
; (docs/plans/kova-cli.md, Phase D). installMode is currentUser, so this only
; touches HKCU\Environment — no admin rights involved. String helpers are
; self-contained (no StrFunc.nsh) to avoid colliding with functions the Tauri
; NSIS template may already declare.
;
; Terminals opened before the install won't see the new PATH — Windows only
; delivers WM_SETTINGCHANGE to new processes.
;
; PATH addition is opt-out via a Yes/No prompt (issue #168) rather than a
; wizard-page checkbox: Tauri's NSIS template only exposes four fixed hook
; macros (PRE/POSTINSTALL, PRE/POSTUNINSTALL), not a way to add a new page,
; and both spare Finish-page checkbox slots (MUI_FINISHPAGE_SHOWREADME /
; MUI_FINISHPAGE_RUN) are already used for the desktop shortcut and "run
; Kova now" options. A plain MessageBox needs no template fork.

!include "WinMessages.nsh"

; Push haystack, push needle → pops both, pushes the 0-based index of the
; first match, or -1 if absent. StrCmp is case-sensitive; the worst case of a
; case-mismatch is a duplicate PATH entry, which Windows tolerates.
!macro KOVA_STRIDX_FUNC un
Function ${un}KovaStrIdx
  Exch $R0        ; needle
  Exch
  Exch $R1        ; haystack
  Push $R2
  Push $R3
  Push $R4
  StrLen $R2 $R0
  StrCpy $R3 0
  loop_${un}:
    StrCpy $R4 $R1 $R2 $R3
    StrCmp $R4 $R0 found_${un}
    StrCmp $R4 "" notfound_${un}
    IntOp $R3 $R3 + 1
    Goto loop_${un}
  found_${un}:
    Goto done_${un}
  notfound_${un}:
    StrCpy $R3 -1
  done_${un}:
  StrCpy $R0 $R3
  Pop $R4
  Pop $R3
  Pop $R2
  Pop $R1
  Exch $R0
FunctionEnd
!macroend
!insertmacro KOVA_STRIDX_FUNC ""
!insertmacro KOVA_STRIDX_FUNC "un."

!macro NSIS_HOOK_POSTINSTALL
  ; /SD IDYES: silent installs (`/S`) keep today's default of adding PATH,
  ; since the message box never displays and IDYES is used automatically.
  MessageBox MB_YESNO|MB_ICONQUESTION "Add the Kova install folder to your PATH?$\r$\n$\r$\nThis lets you run 'kova' from Command Prompt or PowerShell." /SD IDYES IDNO kova_path_done

  ReadRegStr $0 HKCU "Environment" "Path"
  Push $0
  Push "$INSTDIR"
  Call KovaStrIdx
  Pop $1
  IntCmp $1 -1 0 kova_path_done kova_path_done   ; only append when absent
  StrCmp $0 "" 0 +3
    WriteRegExpandStr HKCU "Environment" "Path" "$INSTDIR"
    Goto kova_path_notify
  WriteRegExpandStr HKCU "Environment" "Path" "$0;$INSTDIR"
  kova_path_notify:
    SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=5000
  kova_path_done:
!macroend

; Excise $INSTDIR from the per-user PATH: try the ";dir" form first (mid/end
; of list), then "dir;" (start of list), then the exact-match form (sole
; entry). Leaves PATH untouched when the entry is absent.
!macro NSIS_HOOK_POSTUNINSTALL
  ReadRegStr $0 HKCU "Environment" "Path"
  StrCmp $0 "" kova_unpath_done

  StrCpy $2 ";$INSTDIR"
  Push $0
  Push $2
  Call un.KovaStrIdx
  Pop $1
  IntCmp $1 -1 kova_unpath_try_leading
    Goto kova_unpath_excise

  kova_unpath_try_leading:
  StrCpy $2 "$INSTDIR;"
  Push $0
  Push $2
  Call un.KovaStrIdx
  Pop $1
  IntCmp $1 -1 kova_unpath_try_exact
    Goto kova_unpath_excise

  kova_unpath_try_exact:
  StrCmp $0 "$INSTDIR" 0 kova_unpath_done
    WriteRegExpandStr HKCU "Environment" "Path" ""
    Goto kova_unpath_notify

  kova_unpath_excise:
    StrLen $3 $2
    StrCpy $4 $0 $1          ; prefix: everything before the match
    IntOp $5 $1 + $3
    StrCpy $6 $0 "" $5       ; suffix: everything after the matched needle
    WriteRegExpandStr HKCU "Environment" "Path" "$4$6"

  kova_unpath_notify:
    SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=5000
  kova_unpath_done:
!macroend
