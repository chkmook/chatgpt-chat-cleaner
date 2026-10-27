# GitHub 업로드와 배포

저장소: [chkmook/chatgpt-chat-cleaner](https://github.com/chkmook/chatgpt-chat-cleaner)

## 첫 업로드

현재 폴더를 Git 저장소로 초기화하고 첫 커밋을 올립니다. 저장소가 이미 초기화되어 있다면 `git init`과 `git remote add`는 생략합니다.

```sh
git init -b main
git remote add origin https://github.com/chkmook/chatgpt-chat-cleaner.git
npm run check
npm test
npm run package
git add .
git diff --cached --stat
git diff --cached --check
git commit -m "Release ChatGPT Chat Cleaner 0.4.0"
git push -u origin main
```

`.gitignore`는 배포 ZIP, 테스트 출력, 브라우저 로그, 로컬 계획 파일, `.env` 등을 제외합니다. `git diff --cached`로 실제 업로드 파일을 확인합니다. `dist`의 파일은 소스 커밋에 추가하지 않습니다.

## 0.4.0 배포

`main`의 CI 통과를 확인한 뒤 해당 커밋에 태그를 만듭니다.

```sh
git tag -a v0.4.0 -m "ChatGPT Chat Cleaner 0.4.0"
git push origin v0.4.0
```

태그 푸시는 **GitHub 공개 릴리스 게시**를 실행합니다. `.github/workflows/release.yml`이 다음 작업을 수행합니다.

1. 태그·package·manifest 버전 일치와 실행 파일 구문 검사
2. 단위·패키징 테스트
3. 확장 ZIP 생성·무결성·SHA-256 확인
4. `docs/releases/v0.4.0.md`를 릴리스 본문으로 사용해 ZIP과 `SHA256SUMS` 게시

릴리스 첨부 파일은 `chatgpt-chat-cleaner-0.4.0.zip`과 `SHA256SUMS`입니다. 별도 개인 토큰 없이 GitHub Actions의 `GITHUB_TOKEN`을 사용합니다. 저장소나 조직 정책에서 Actions 쓰기 권한을 제한한다면 릴리스 게시 권한을 허용해야 합니다.

## 다음 버전

1. `package.json`과 `extension/manifest.json`의 버전을 함께 올립니다.
2. `CHANGELOG.md`와 해당 버전의 `docs/releases/vX.Y.Z.md`를 작성합니다.
3. README의 설치 파일명과 `scripts/extension-smoke.js`의 예상 버전을 갱신합니다.
4. 검사·브라우저 확인 후 `VALIDATION.md`에 결과와 확인 한계를 기록합니다.
5. 변경을 커밋·푸시한 뒤 같은 버전의 `vX.Y.Z` 태그를 푸시합니다.

이미 게시한 버전의 태그나 첨부 ZIP을 교체하지 않고 새 버전으로 배포합니다. 릴리스가 이미 존재하면 워크플로는 덮어쓰지 않고 실패합니다. 오류를 수정한 후 Actions에서 실패한 실행을 재실행할 수 있습니다. 이미 릴리스가 생성되었다면 첨부 상태부터 확인합니다.

## 로컬 ZIP 확인

```sh
npm run package
cd dist
shasum -a 256 -c SHA256SUMS
unzip -t chatgpt-chat-cleaner-0.4.0.zip
```

Linux에서는 `shasum -a 256 -c` 대신 `sha256sum --check`도 사용할 수 있습니다. 패키징은 manifest에 연결된 실행 파일만 포함하며 파일 시간·권한을 정규화합니다. 같은 소스와 같은 ZIP 도구에서는 동일한 바이트를 생성합니다.

## Chrome 웹 스토어

현재 배포 방식은 GitHub Release에서 ZIP을 내려받아 개발자 모드로 설치하는 방식입니다. Chrome 웹 스토어 등록이나 자동 업데이트 배포는 별도이며, 이 워크플로에 포함하지 않습니다.
