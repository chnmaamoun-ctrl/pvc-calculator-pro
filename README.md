# PVC Calculator Pro - Formula Excel Edition

## What's included
- `index.html` / `styles.css` / `app.js`: the updated calculator.
- `formula.json`: initial formulas loaded in the calculator.
- `pvc_formulas_import.xlsx`: Formula Excel file importable by the calculator.
- `raw_material_prices_template.xlsx`: raw material price list with Material Name, Category and Price EGP/Kg.

## Main updates
- Previous demo formulas are removed from the default data.
- The calculator now starts with the formulas extracted from the supplied PVC Soft and PVC Rigid workbooks.
- Formula selection is grouped by `PVC Soft` and `PVC Rigid`.
- Formula Excel import is available from the calculator interface.
- Formula Excel export is available from the calculator interface.
- Material names in formulas are aligned with the Raw Material file wherever a matching material exists.

## Formula Excel format
Keep these headers unchanged:
Formula Type, Formula Code, Application, Batch Kg, Waste %, Mfg Cost EGP/Ton, Packing EGP/Ton, Transport EGP/Ton, Finance EGP/Ton, Margin %, Material Category, Material Name, Original Material Name, PHR / Qty, Price EGP/Kg, Source

The workbook is split into:
- PVC Soft Formulas
- PVC Rigid Formulas

## Notes
- If the browser previously saved old data, this version uses new storage keys and will start with the new formula set.
- Excel import requires the SheetJS CDN to load, so internet access is recommended when importing `.xlsx` files.

## تحديث v4 - شاشة العميل وتنسيق الأسعار

- تم ضبط عرض أسعار الخامات وكل القيم المالية داخل الحاسبة برقمين عشريين فقط.
- تم إضافة شاشة مستقلة في نهاية الحاسبة باسم: شاشة العميل - اسم الخامة وسعر البيع.
- شاشة العميل تعرض اسم الخلطة/الخامة وسعر البيع للطن والكيلو فقط، بدون تفاصيل التركيبة أو تكلفة الخامات.
- تم إضافة زر نسخ العرض وزر طباعة / PDF للعميل.


## تحديث v5 - شاشة العميل
- شاشة العميل تعرض الآن اسم الخامة وسعر البيع/كجم فقط.
- تم حذف سعر البيع/طن من شاشة العميل ومن النسخ.
- عند استخدام زر طباعة / PDF للعميل يتم تغيير عنوان صفحة الطباعة إلى اسم الخامة المختارة، بحيث يظهر كاسم مقترح لملف PDF في أغلب المتصفحات.

## تشغيل الحاسبة Online / Offline على الموبايل واللاب

هذه النسخة مجهزة كتطبيق ويب PWA. عند رفعها على GitHub Pages أو أي استضافة HTTPS، يمكن فتحها من الموبايل واللاب وتثبيتها على الجهاز.

### التشغيل Online
1. ارفع محتويات المجلد على GitHub Pages أو استضافة HTTPS.
2. افتح رابط `index.html` من المتصفح.
3. استخدم الحاسبة بشكل طبيعي من اللاب أو الموبايل.

### التثبيت على الموبايل
- Android / Chrome: افتح الرابط ثم اضغط Install أو Add to Home Screen.
- iPhone / Safari: افتح الرابط ثم Share ثم Add to Home Screen.

### التثبيت على اللاب
- Chrome / Edge: افتح الرابط، ثم اضغط أيقونة Install في شريط العنوان أو زر "تثبيت على الجهاز" داخل الحاسبة إن ظهر.

### التشغيل Offline
بعد فتح الحاسبة Online أول مرة وهي محملة بالكامل، سيتم تخزين ملفات التطبيق الأساسية. بعدها يمكن فتحها بدون إنترنت من أيقونة التطبيق المثبتة أو من الرابط السابق في نفس المتصفح.

ملاحظة: استيراد وتصدير Excel يحتاج تحميل مكتبة Excel أول مرة أثناء الاتصال بالإنترنت. بعد ذلك سيحاول التطبيق تخزينها للاستخدام Offline.
