import {translateDocument} from './i18n/runtime.js';
export function passwordControl(id,label,autocomplete,minLength){
 const name=id==='password-confirm'?'passwordConfirm':'password';
 return `<label class="form-label" for="${id}">${label}</label><div class="password-field"><input class="control" id="${id}" name="${name}" type="password" autocomplete="${autocomplete}" minlength="${minLength}" maxlength="128" required aria-describedby="auth-error"><button type="button" class="password-toggle" data-password-toggle="${id}" aria-controls="${id}" aria-pressed="false" aria-label="${id==='password-confirm'?'Показать подтверждение пароля':'Показать пароль'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/><path class="password-eye-slash" d="m3 3 18 18"/></svg></button></div>`;
}
export function mountPasswordControls(){
 for(const button of document.querySelectorAll('[data-password-toggle]'))button.onclick=()=>{
  const input=document.getElementById(button.dataset.passwordToggle),show=input.type==='password';input.type=show?'text':'password';button.setAttribute('aria-pressed',String(show));
  button.setAttribute('aria-label',input.id==='password-confirm'?(show?'Скрыть подтверждение пароля':'Показать подтверждение пароля'):(show?'Скрыть пароль':'Показать пароль'));translateDocument();
 };
}
