export type FieldErrors = Record<string, string>;

const EMAIL_MAX = 254;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;
const NAME_MAX = 30;
const NICKNAME_MIN = 2;
const NICKNAME_MAX = 20;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NICKNAME_RE = /^[가-힣a-zA-Z0-9_-]+$/;
const PHONE_RE = /^[0-9+\-()\s]+$/;

export type SignupInput = {
  email: string;
  name: string;
  nickname: string;
  password: string;
  passwordConfirm: string;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type ProfileInput = {
  name: string;
  nickname: string;
  phone: string;
};

export type PasswordChangeInput = {
  currentPassword: string;
  newPassword: string;
  newPasswordConfirm: string;
};

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function passwordError(password: string): string | null {
  if (password.length < PASSWORD_MIN) {
    return `비밀번호는 ${PASSWORD_MIN}자 이상이어야 합니다.`;
  }
  if (password.length > PASSWORD_MAX) {
    return `비밀번호는 ${PASSWORD_MAX}자 이하여야 합니다.`;
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "비밀번호는 영문과 숫자를 각각 하나 이상 포함해야 합니다.";
  }
  return null;
}

function nicknameError(nickname: string): string | null {
  if (nickname.length < NICKNAME_MIN || nickname.length > NICKNAME_MAX) {
    return `닉네임은 ${NICKNAME_MIN}~${NICKNAME_MAX}자여야 합니다.`;
  }
  if (!NICKNAME_RE.test(nickname)) {
    return "닉네임은 한글, 영문, 숫자, _, -만 사용할 수 있습니다.";
  }
  return null;
}

export function validateSignup(
  formData: FormData,
): { errors: FieldErrors; data?: SignupInput } {
  const email = getString(formData, "email").trim();
  const name = getString(formData, "name").trim();
  const nickname = getString(formData, "nickname").trim();
  const password = getString(formData, "password");
  const passwordConfirm = getString(formData, "passwordConfirm");

  const errors: FieldErrors = {};

  if (!email) {
    errors.email = "이메일을 입력해 주세요.";
  } else if (email.length > EMAIL_MAX || !EMAIL_RE.test(email)) {
    errors.email = "올바른 이메일 형식이 아닙니다.";
  }

  if (!name) {
    errors.name = "이름을 입력해 주세요.";
  } else if (name.length > NAME_MAX) {
    errors.name = `이름은 ${NAME_MAX}자 이하여야 합니다.`;
  }

  const nicknameErrorMsg = nicknameError(nickname);
  if (nicknameErrorMsg) {
    errors.nickname = nicknameErrorMsg;
  }

  const pwError = passwordError(password);
  if (pwError) {
    errors.password = pwError;
  }

  if (passwordConfirm !== password) {
    errors.passwordConfirm = "비밀번호가 일치하지 않습니다.";
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  return { errors: {}, data: { email, name, nickname, password, passwordConfirm } };
}

export function validateLogin(
  formData: FormData,
): { errors: FieldErrors; data?: LoginInput } {
  const email = getString(formData, "email").trim();
  const password = getString(formData, "password");

  const errors: FieldErrors = {};

  if (!email || email.length > EMAIL_MAX || !EMAIL_RE.test(email)) {
    errors.email = "올바른 이메일을 입력해 주세요.";
  }

  if (!password) {
    errors.password = "비밀번호를 입력해 주세요.";
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  return { errors: {}, data: { email, password } };
}

export function validateProfile(
  formData: FormData,
): { errors: FieldErrors; data?: ProfileInput } {
  const name = getString(formData, "name").trim();
  const nickname = getString(formData, "nickname").trim();
  const phone = getString(formData, "phone").trim();

  const errors: FieldErrors = {};

  if (!name) {
    errors.name = "이름을 입력해 주세요.";
  } else if (name.length > NAME_MAX) {
    errors.name = `이름은 ${NAME_MAX}자 이하여야 합니다.`;
  }

  const nicknameErrorMsg = nicknameError(nickname);
  if (nicknameErrorMsg) {
    errors.nickname = nicknameErrorMsg;
  }

  if (phone && !PHONE_RE.test(phone)) {
    errors.phone = "올바른 전화번호 형식이 아닙니다.";
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  return { errors: {}, data: { name, nickname, phone } };
}

export function validatePasswordChange(
  formData: FormData,
): { errors: FieldErrors; data?: PasswordChangeInput } {
  const currentPassword = getString(formData, "currentPassword");
  const newPassword = getString(formData, "newPassword");
  const newPasswordConfirm = getString(formData, "newPasswordConfirm");

  const errors: FieldErrors = {};

  if (!currentPassword) {
    errors.currentPassword = "현재 비밀번호를 입력해 주세요.";
  }

  const pwError = passwordError(newPassword);
  if (pwError) {
    errors.newPassword = pwError;
  }

  if (newPasswordConfirm !== newPassword) {
    errors.newPasswordConfirm = "새 비밀번호가 일치하지 않습니다.";
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  return {
    errors: {},
    data: { currentPassword, newPassword, newPasswordConfirm },
  };
}
