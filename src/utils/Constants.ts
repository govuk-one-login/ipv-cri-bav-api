export class Constants {

	static readonly X_SESSION_ID = "x-govuk-signin-session-id";

	static readonly SESSION_ID = "session-id";

	static readonly SESSION_LOGGER_SVC_NAME : "SessionHandler";

	static readonly F2F_METRICS_NAMESPACE = "BAV-CRI";

	static readonly DEBUG = "DEBUG";

	static readonly INFO = "INFO";

	static readonly WARN = "WARN";

	static readonly ERROR = "ERROR";

	static readonly BEARER = "Bearer";

	static readonly CODE = "code";

	static readonly REDIRECT_URL = "redirect_uri";

	static readonly GRANT_TYPE = "grant_type";

	static readonly AUTHORIZATION_CODE = "authorization_code";

	static readonly AUTHORIZATION_CODE_INDEX_NAME = "authCode-updated-index";

	static readonly TOKEN_EXPIRY_SECONDS = 3600;

	static readonly REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

	static readonly GOV_NOTIFY = "GOV_NOTIFY";

	static readonly ENV_VAR_UNDEFINED = "ENV Variables are undefined";

	static readonly W3_BASE_CONTEXT = "https://www.w3.org/2018/credentials/v1";

  static readonly DI_CONTEXT = "https://vocab.account.gov.uk/contexts/identity-v1.jsonld";

  static readonly VERIFIABLE_CREDENTIAL = "VerifiableCredential";

  static readonly IDENTITY_CHECK_CREDENTIAL = "IdentityCheckCredential";

  static readonly URN_UUID_PREFIX = "urn:uuid:";
  
}