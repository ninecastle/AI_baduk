# 바둑랩 (Baduk Lab)

KataGo 신경망을 브라우저에서 직접 실행하는 바둑 앱. 봇 대전 · 체스닷컴식 게임 리뷰 · 사활 문제집 · 기보함.

- 설치형 웹앱(PWA): 한 번 열면 오프라인에서도 동작 (신경망 포함)
- 기기 간 동기화: Firebase(구글 로그인 + Firestore) — `firebase-config.js` 추가 시 활성화

## 구성

| 파일 | 역할 |
|---|---|
| `index.html`, `app.css`, `app.js` | 앱 화면·대국·기보함·설정 |
| `go.js` | 바둑 규칙(따냄·패·동형반복·계가·SGF) |
| `board-view.js` | 캔버스 바둑판 렌더러(테마·돌·표식) |
| `engine.worker.js` | 보조 탐색 엔진(KataGo 로드 실패 시 폴백) |
| `kata/` | KataGo 이식: 판·입력 특징·신경망 순전파(TF.js/CPU)·탐색 |
| `models/b10c128.wasm` | KataGo g170 b10c128 신경망 가중치(f16, KBN 포맷; 확장자는 호스팅 편의) |
| `review.js` | 게임 리뷰(정확도·수 분류·승률 그래프·수순 보기) |
| `tsumego.js`, `tsumego-data.js`, `tsumego-ui.js` | 사활 풀이기·문제집·화면 |
| `sync.js`, `sw.js`, `manifest.webmanifest` | 동기화·오프라인 캐시·설치 |
| `tools/` | 모델 변환기, 사활 문제 생성기(node) |

## Firebase 연결

1. Firebase 콘솔에서 프로젝트 → 웹 앱 추가 → 설정값을 `firebase-config.js`에 저장:
   ```js
   window.FIREBASE_CONFIG = { apiKey: "...", authDomain: "...", projectId: "...", appId: "..." };
   ```
2. Authentication → Google 로그인 사용. 승인된 도메인에 `사용자.github.io` 추가.
3. Firestore 데이터베이스 생성 후 규칙:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```

## 라이선스
KataGo 신경망·알고리즘: MIT (lightvector/KataGo). 앱 코드: MIT.
