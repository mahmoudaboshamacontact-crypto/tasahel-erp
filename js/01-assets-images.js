/* كان فيه صور base64 ضخمة (~300KB) بتتحمّل مع كل فتح؛ اتحوّلت لملف الصورة العادي (بيتخزّن في المتصفح). */
window.TASAHEL_LOGO='logo-transparent.png';
window.TASAHEL_BRAND='logo-transparent.png';
window.logoImg = function (h, mb) {
  var height = h || 40;
  var margin = mb || 0;
  var src = window.TASAHEL_LOGO || 'logo-transparent.png';
  return '<img src="' + src + '" alt="تساهيل" style="height:' + height + 'px;width:auto;margin-bottom:' + margin + 'px" onerror="this.src=\'logo.png\'">';
};
