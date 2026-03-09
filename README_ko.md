# 📌 Temporary Bookmarks (임시 북마크)

> 자동 만료 및 Google Drive 동기화 기능을 제공하는 Chrome 임시 북마크 확장 프로그램

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green?logo=google-chrome)](https://chrome.google.com/webstore)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-orange.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)

## ✨ 주요 기능

- **🎯 원클릭 저장** - 현재 페이지를 즉시 임시 북마크로 저장
- **⏰ 자동 만료** - 사용자 정의 만료일 설정 또는 영구 저장
- **↩️ 삭제 실행취소** - 실수로 삭제한 북마크를 3초 이내 복원
- **☁️ Google Drive 동기화** - 여러 기기 간 안전한 북마크 동기화
- **🌍 다국어 지원** - 영어, 한국어 지원
- **🔒 프라이버시 우선** - 모든 데이터 로컬 저장, 선택적 클라우드 동기화

## 🛠️ 기술 스택

- **Chrome Extension Manifest V3**
- **JavaScript ES2020+**
- **Chrome Storage API**
- **Chrome Alarms API**
- **Google Drive API (OAuth2)**

## 📦 설치

### Chrome 웹 스토어에서 설치

[🏪 Chrome 웹 스토어에서 설치](https://chrome.google.com/webstore/detail/adclfhflhjnpdahjcnliibmddpolfaga)

### 소스에서 설치

1. 이 레포지토리를 클론합니다

```bash
git clone https://github.com/JinohK/Temporary-Bookmarks.git
cd temporary-bookmarks
```

2. Chrome을 열고 `chrome://extensions/`로 이동합니다

3. 우측 상단의 "개발자 모드"를 활성화합니다

4. "압축해제된 확장 프로그램을 로드합니다"를 클릭하고 `extension` 폴더를 선택합니다

## 🚀 사용 방법

### 북마크 저장

1. 브라우저 도구 모음에서 확장 프로그램 아이콘 클릭
2. "페이지 저장" 버튼 클릭
3. 현재 페이지가 북마크로 저장됨

### 만료일 설정

1. 목록에서 북마크 찾기
2. 북마크 옆 입력 필드에 일수 입력
3. 비워두거나 `0` 입력 시 영구 저장

### 북마크 삭제

1. 북마크 옆 "삭제" 버튼 클릭
2. 3초 이내 "실행취소" 클릭으로 북마크 복원

### Google Drive 동기화

1. 팝업에서 "연결" 버튼 클릭
2. Google 계정으로 로그인
3. Google Drive 접근 권한 허용
4. 여러 기기 간 북마크 자동 동기화

## 🔒 프라이버시

이 확장 프로그램은 귀하의 프라이버시를 존중합니다:

- **로컬 저장** - 기본적으로 모든 데이터를 로컬에 저장
- **선택적 동기화** - Google Drive 동기화는 선택 사항
- **추적 금지** - 분석이나 추적 스크립트 없음
- **오픈 소스** - 모든 코드가 공개되어 감사 가능

자세한 내용은 [PRIVACY_ko.md](PRIVACY_ko.md)를 참조하세요

## 🤝 기여

기여는 언제나 환영합니다! Pull Request를 자유롭게 제출해 주세요.

1. 레포지토리 포크
2. 기능 브랜치 생성 (`git checkout -b feature/AmazingFeature`)
3. 변경 사항 커밋 (`git commit -m 'Add some AmazingFeature'`)
4. 브랜치에 푸시 (`git push origin feature/AmazingFeature`)
5. Pull Request 열기

## 📝 라이선스

이 프로젝트는 MIT 라이선스 하에 제공됩니다 - 자세한 내용은 [LICENSE](LICENSE) 파일을 확인하세요.

## 📧 문의하기

질문, 제안, 이슈가 있으시면:

- **GitHub Issues:** [https://github.com/JinohK/Temporary-Bookmarks/issues](https://github.com/JinohK/Temporary-Bookmarks/issues)
