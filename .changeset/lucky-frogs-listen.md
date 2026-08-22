---
"@palantir/pack.app": patch
---

Fix reload loop in demo mode: DemoPublicOauthClient now completes the OAuth callback from signIn()/getToken() instead of its constructor, and signIn() no longer redirects when a valid token already exists
