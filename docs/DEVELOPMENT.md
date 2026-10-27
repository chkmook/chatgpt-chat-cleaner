# 개발 안내

## 환경

- Chrome 111 이상
- Node.js 18 이상. GitHub Actions는 Node.js 24를 사용합니다.
- `zip`·`unzip`: macOS와 일반적인 Linux 환경에서 사용합니다. Windows에서는 WSL 등에서 패키징합니다.

런타임과 단위 테스트에 npm 의존성이 없어 `npm install`은 필요하지 않습니다.

## 구조

| 경로 | 역할 |
| --- | --- |
| `extension/` | Chrome에 로드하는 확장 실행 파일 |
| `tests/` | 요청 경계·핵심 로직·패키징 검사와 가짜 화면 |
| `scripts/` | 데모 서버·검사·패키징 도구 |
| `.github/workflows/` | CI와 태그 기반 릴리스 |
| `docs/releases/` | 버전별 릴리스 본문 |
| `VALIDATION.md` | 실행한 검증과 확인 한계 |

`bridge.js`는 ChatGPT 페이지의 MAIN world에서 세션 확인과 제한된 삭제·보관 요청을 수행합니다. `api.js`는 인증 정보를 전달하지 않는 메시지 클라이언트이며, `adapter.js`·`inline.js`·`content.js`는 사이드바 선택과 확인·진행 UI를 담당합니다.

## 기본 검사

```sh
npm run check
npm test
npm run package
```

`check`는 이름·버전·manifest 리소스와 실행 JavaScript 구문을 검사합니다. `RELEASE_TAG=v0.4.0 npm run check`로 릴리스 태그도 확인할 수 있습니다.

`npm test`는 요청 대상·순서·인증 정보 경계·계정 변경·시간 초과·자동 재시도 금지와 ZIP 구성·체크섬·버전 불일치를 검사합니다. ZIP에는 manifest가 참조하는 실행 파일만 포함합니다.

## 데모와 브라우저 검사

```sh
npm run demo
```

`http://127.0.0.1:4173`에서 가짜 대화·로그인·작업 응답을 제공합니다. ChatGPT로 전달하는 프록시가 아닙니다.

Playwright CLI를 사용할 수 있다면 데모 서버를 실행한 상태에서 다음 검사를 수행합니다. 브라우저 CLI는 별도 개발 도구이며 프로젝트 의존성에 포함하지 않습니다.

```sh
playwright-cli open http://127.0.0.1:4173
playwright-cli run-code --filename scripts/selection-checks.js
playwright-cli run-code --filename scripts/confirmation-checks.js
playwright-cli run-code --filename scripts/api-checks.js
playwright-cli close
```

`scripts/extension-smoke.js`는 `extension`을 unpacked 확장으로 로드한 별도 Chrome for Testing 프로필에서 실행합니다. MAIN/isolated 경계를 확인하기 위한 검사이며, 탐색 전에 모든 `https://chatgpt.com/**` 요청을 가짜 응답으로 대체합니다. 사용자 Chrome 프로필에서 실행하지 않습니다.

이전 `browser-checks.js`, `batch-checks.js`, `pending-checks.js`, `*-regression-checks.js`는 0.2.x 메뉴 조작 방식의 재현 기록입니다. 현재 0.4.0 검사 결과에 합산하지 않습니다.

CI는 기본 검사·단위 테스트·패키징을 실행합니다. 브라우저 검사와 실제 계정 삭제·보관을 실행하지 않습니다. 가짜 응답 성공을 실제 서버 호환성 검증으로 해석하지 않습니다.
