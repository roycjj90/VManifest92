export const initializeApp = () => ({ __fake: true })
export const initializeAppCheck = () => ({})
export class ReCaptchaV3Provider { constructor() {} }
export class ReCaptchaEnterpriseProvider { constructor() {} }
// No site key is set under test, so src/firebase.js never calls this — it exists
// so the import resolves.
export const getToken = async () => ({ token: '' })
