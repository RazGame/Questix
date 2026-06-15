# Перевод утилитарных классов со светлой темы на тёмную.
# Замены упорядочены: сначала специфичные комбинации, потом общие токены.
$files = Get-ChildItem `
  C:\Projects\quest-modern\frontend\src\pages\*.tsx, `
  C:\Projects\quest-modern\frontend\src\components\*.tsx

$map = @(
  # --- Обёртки страниц: фон даёт body ---
  @('min-h-screen bg-gray-50', 'min-h-screen'),

  # --- Карточки ---
  @('bg-white rounded-lg shadow-lg overflow-hidden', 'glass overflow-hidden'),
  @('bg-white rounded-lg shadow overflow-hidden', 'glass overflow-hidden'),
  @('bg-white rounded-lg shadow-lg', 'glass'),
  @('bg-white rounded-lg shadow', 'glass'),
  @('bg-white p-4 rounded shadow', 'glass p-4'),
  @('bg-white p-4 rounded mb-4', 'glass p-4 mb-4'),
  @('bg-white divide-y divide-gray-200', 'divide-y divide-white/10'),
  @("'bg-white' : 'bg-gray-50'", "'' : 'bg-white/[0.02]'"),

  # --- Бейджи (до общих правил) ---
  @('bg-green-100 text-green-800', 'bg-emerald-400/10 text-emerald-300'),
  @('bg-red-100 text-red-800', 'bg-rose-400/10 text-rose-300'),
  @('bg-yellow-100 text-yellow-800', 'bg-amber-400/10 text-amber-300'),
  @('bg-blue-100 text-blue-800', 'bg-sky-400/10 text-sky-300'),
  @('bg-purple-100 text-purple-800', 'bg-violet-400/10 text-violet-300'),
  @('bg-gray-100 text-gray-800', 'bg-white/10 text-zinc-300'),

  # --- Алерты ---
  @('bg-red-100 border border-red-400 text-red-700', 'bg-rose-500/10 border border-rose-500/30 text-rose-300'),
  @('bg-red-100 text-red-700', 'bg-rose-500/10 border border-rose-500/20 text-rose-300'),
  @('bg-green-100 text-green-700', 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'),
  @('bg-yellow-50 border border-yellow-200', 'bg-amber-500/10 border border-amber-500/30'),

  # --- Кнопки ---
  @('bg-blue-500 hover:bg-blue-600 text-white', 'btn-grad'),
  @('bg-green-500 hover:bg-green-600 text-white', 'bg-emerald-600 hover:bg-emerald-500 text-white'),
  @('bg-green-600 hover:bg-green-700 text-white', 'bg-emerald-600 hover:bg-emerald-500 text-white'),
  @('bg-green-500 text-white py-2 rounded hover:bg-green-600', 'bg-emerald-600 text-white py-2 rounded hover:bg-emerald-500'),
  @('bg-green-600 text-white', 'bg-emerald-600 hover:bg-emerald-500 text-white'),
  @('bg-red-500 hover:bg-red-600 text-white', 'bg-rose-600/90 hover:bg-rose-500 text-white'),
  @('bg-gray-500 hover:bg-gray-600 text-white', 'bg-white/10 hover:bg-white/20 text-zinc-200 border border-white/10'),
  @('bg-gray-400 hover:bg-gray-500 text-white', 'bg-white/10 hover:bg-white/20 text-zinc-200 border border-white/10'),
  @('bg-gray-700 hover:bg-gray-800 text-white', 'bg-white/10 hover:bg-white/20 text-zinc-200 border border-white/10'),
  @('bg-gray-200 text-gray-600', 'bg-white/5 text-zinc-500'),

  # --- Поля ввода ---
  @('w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 mb-2', 'input-dark mb-2'),
  @('w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500', 'input-dark'),
  @('flex-1 border rounded px-3 py-2 text-sm', 'input-dark flex-1 text-sm'),
  @('w-full border rounded px-3 py-2 text-sm', 'input-dark text-sm'),
  @('w-full border rounded px-3 py-2', 'input-dark'),
  @('w-full border rounded px-2 py-1', 'input-dark px-2 py-1'),

  # --- Таблицы и списки ---
  @('bg-gray-100 sticky top-0', 'bg-[#17112a] sticky top-0'),
  @('bg-gray-100 hover:bg-gray-200', 'bg-white/5 hover:bg-white/10'),
  @('hover:bg-gray-50', 'hover:bg-white/5'),

  # --- Общие токены (в конце) ---
  @('border-gray-200', 'border-white/10'),
  @('border-gray-300', 'border-white/10'),
  @('divide-gray-200', 'divide-white/10'),
  @('bg-gray-200', 'bg-white/10'),
  @('bg-gray-100', 'bg-white/5'),
  @('bg-gray-50', 'bg-white/[0.03]'),
  @('text-gray-900', 'text-zinc-100'),
  @('text-gray-800', 'text-zinc-200'),
  @('text-gray-700', 'text-zinc-300'),
  @('text-gray-600', 'text-zinc-400'),
  @('text-gray-500', 'text-zinc-500'),
  @('text-gray-400', 'text-zinc-500'),
  @('border-blue-500', 'border-primary'),
  @('text-blue-600', 'text-violet-400'),
  @('text-blue-800', 'text-violet-300'),
  @('text-blue-700', 'text-violet-300'),
  @('text-blue-100', 'text-violet-100'),
  @('bg-blue-50', 'bg-primary/10'),
  @('from-blue-500 to-blue-600', 'from-violet-600/80 to-fuchsia-600/80'),
  @('text-red-600', 'text-rose-400'),
  @('text-red-800', 'text-rose-300'),
  @('text-red-700', 'text-rose-300'),
  @('text-green-700', 'text-emerald-300'),
  @('text-green-800', 'text-emerald-300'),
  @('text-yellow-800', 'text-amber-200'),
  @('bg-yellow-50', 'bg-amber-400/[0.07]'),
  @('border-yellow-200', 'border-amber-500/30')
)

foreach ($file in $files) {
  $content = Get-Content $file.FullName -Raw
  $original = $content
  foreach ($pair in $map) {
    $content = $content.Replace($pair[0], $pair[1])
  }
  if ($content -ne $original) {
    Set-Content -Path $file.FullName -Value $content -NoNewline -Encoding utf8
    Write-Host "restyled: $($file.Name)"
  }
}
