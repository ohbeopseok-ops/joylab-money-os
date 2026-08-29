# JoyLab Money OS V1.0 FINAL

JoyLab Money OS는 하루 변동비 기록, 월별 분석, 태그 비중, 소비 Score, 월 마감과 회귀 검증을 제공하는 개인 소비 관리 앱입니다.

## Web
- Vite + TypeScript
- PWA
- localStorage 기반
- Vercel 배포 가능

## Windows Portable EXE
Tauri 2 기반으로 설치 없이 실행 가능한 단일 EXE를 GitHub Actions에서 빌드합니다.

Actions → **Build Portable EXE** → Run workflow → Artifacts에서 `JoyLab_Money_OS_V1.0_Portable` 다운로드

## Local build
```powershell
npm install
npm run build
cargo build --release --manifest-path src-tauri\Cargo.toml
```

완성 파일:
`src-tauri\target\release\joylab-money-os.exe`

## Frozen policy
V1.0 FINAL 이후 신규 기능 추가는 중단하며, 버그 수정·문구·모바일 UX·보안·호환성·테스트 강화만 허용합니다.
