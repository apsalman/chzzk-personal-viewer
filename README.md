# AZZZT LOCAL VIEWER

치지직 라이브·다시보기 영상과 채팅을 함께 보는 Windows 앱입니다.

## 사용 기술

- **Electron**: 데스크톱 창, 네이버 로그인, 공식 채팅
- **Node.js**: 로컬 서버, 방송 정보 조회, CDN 영상 중계
- **HTML / CSS / JavaScript + HLS.js**: 영상 재생과 화면 구성
- **FFmpeg**: 녹화, 리플레이, VOD 다운로드
- **faster-whisper / Python**: 로컬 한국어 음성 인식(CPU·INT8)

## 주요 기능

- 라이브·다시보기·m3u8 재생, 자동·수동 화질 선택
- 공식 라이브 채팅, 네이버 로그인, 팔로우 LIVE 목록
- 다시보기 재생 시각에 맞춘 과거 채팅·이모티콘 표시
- 다시보기 재생 바에 마우스를 올리면 해당 시점의 썸네일 미리보기
- 다시보기 재생 속도 조절(0.25~2배), 화질 변경·PiP에서도 유지
- 앱 재시작 시 VOD 이어보기, 마지막 생방송이 방송 중이면 자동 재생
- 감상모드, 전체 화면, PiP, 채팅 너비·창 위치 저장
- 라이브 녹화, 1분~2시간 리플레이 버퍼, 최근 구간 MP4 저장
- VOD 전체 MP4 다운로드, 진행률 표시·취소
- 무료 한국어 자동 자막, Tiny/Base 모델 선택, 처리 시간·지연 표시

녹화·리플레이·다운로드는 독립 앱에서 지원하며 **FFmpeg가 필요**합니다. FFmpeg를 설치하거나 앱 폴더에 `tools/ffmpeg.exe`를 넣으세요.

자동 자막은 최초 한 번 `./setup-captions.ps1`을 실행한 뒤, 독립 앱에서 영상을 재생하고 **한국어 자막 켜기**를 누르세요. Python 3.10 이상과 모델 다운로드가 필요합니다. 이후에는 API 키·사용료 없이 PC에서 처리합니다. 4초 단위 인식으로 지연·오인식이 있으며 자막은 메인 영상에 표시됩니다. 느리면 Tiny를 선택하세요.

## 단축키

| 키 | 동작 |
|---|---|
| ↑ / ↓ | 볼륨 ±5% |
| ← / → | 5초 뒤로 / 앞으로 |
| F | 영상 + 채팅 전체 화면 |
| F11 / Alt+Enter | 영상만 전체 화면 |
| Esc | 전체 화면·감상모드·PiP 종료 |
| Home / End | 재생 바에 초점이 있을 때 시작 / 끝으로 이동 |

입력란에서 글을 쓰는 동안에는 플레이어 단축키가 작동하지 않습니다. 영상 우클릭 메뉴에서 PiP를 켤 수 있습니다.

## 실행

| 방식 | 실행 방법 | 필요 환경 |
|---|---|---|
| 독립 앱 | `start-app.cmd` 또는 `dist/ChzzkViewer/ChzzkViewer.exe` | 아래 빌드 또는 빌드된 앱 폴더 |
| WebUI | `start-webui.cmd` → `http://127.0.0.1:3131` | Node.js 22 이상 |
| 채팅 전용 | `start-chat.cmd` | Chrome 또는 Edge |

주소란에 치지직 라이브·다시보기 주소를 입력하고 **방송 열기**를 누르세요. WebUI의 라이브 채팅은 별도 창으로 열립니다. WebUI 서버 종료는 `stop-webui.cmd`입니다.

## 빌드·테스트

프로젝트 폴더의 PowerShell에서 실행합니다.

```powershell
./build-desktop.ps1     # Electron 다운로드·체크섬 확인 후 Windows x64 앱 생성
./package-release.ps1   # 배포 ZIP 생성 (동일 이름의 기존 ZIP은 먼저 이동)
node --test            # 테스트 (Node.js 22 이상)
```

빌드 결과는 `dist/ChzzkViewer/`, 배포 파일은 `ChzzkViewer-Windows-x64.zip`입니다. 다른 PC로 옮길 때는 앱 폴더 전체를 복사하세요.

## 저장 위치·참고

- `profile/`: 앱 로그인·설정
- `Recordings/`: 녹화·최근 구간 MP4
- `Downloads/`: VOD 다운로드 MP4
- `%LOCALAPPDATA%/AZZZT/captions/`: 자막 엔진·모델(배포본 제외)

위 폴더는 앱 실행 파일 옆에 생성되며 Git·배포 ZIP에서 제외됩니다. FFmpeg는 배포본에 포함하지 않습니다.

로그인 필요 방송의 영상 추출은 지원하지 않습니다. 과거 채팅은 읽기 전용이며, 스트림 만료 시 **다시 연결**을 누르세요. 치지직 API 변경에 따라 수정이 필요할 수 있습니다.

방송 정보 조회는 [yt-dlp의 CHZZK 구현](https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/chzzk.py)을 참고했습니다. HLS.js 라이선스는 `public/vendor/hls.LICENSE`에 있습니다.
