@echo off
setlocal enabledelayedexpansion
set "DL=%USERPROFILE%\Downloads"

if not exist "app" (
  echo This doesn't look like the repo root - no "app" folder here.
  echo cd into tee-to-green-web first, then run this again.
  pause
  exit /b 1
)

echo Installing BookMyPro update files from %DL%
echo into %CD%
echo.

rem --- Calendar timezone fix (original delivery) ---
call :copyfile "bookings-route*.ts" "app\api\[slug]\bookings\route.ts"
call :copyfile "club-billed-route*.ts" "app\api\[slug]\packages\club-billed\route.ts"
call :copyfile "pay-later-route*.ts" "app\api\[slug]\packages\pay-later\route.ts"
call :copyfile "stripe-connect-route*.ts" "app\api\[slug]\stripe\connect\route.ts"
call :copyfile "square-webhook-route*.ts" "app\api\square\webhook\route.ts"
call :copyfile "stripe-webhook-route*.ts" "app\api\stripe\webhook\route.ts"
call :copyfile "email*.ts" "lib\email.ts"
call :copyfile "seedAvailability*.ts" "lib\seedAvailability.ts"
call :copyfile "BookingClient*.tsx" "app\[slug]\book\BookingClient.tsx"
call :copyfile "InstructorClient*.tsx" "app\[slug]\instructor\InstructorClient.tsx"

rem --- Sandbox invite fix ---
call :copyfile "players-route*.ts" "app\api\[slug]\players\route.ts"
call :copyfile "sandbox-quick-route*.ts" "app\api\[slug]\sandbox-links\quick\route.ts"

rem --- SEO / pricing page delivery ---
call :copyfile "layout*.tsx" "app\layout.tsx"
call :copyfile "homepage-page*.tsx" "app\page.tsx"
call :copyfile "sitemap*.ts" "app\sitemap.ts"
call :copyfile "pricing-page*.tsx" "app\pricing\page.tsx"

rem --- Per-business page title delivery ---
call :copyfile "pageMetadata*.ts" "lib\pageMetadata.ts"
call :copyfile "book-page*.tsx" "app\[slug]\book\page.tsx"
call :copyfile "customers-page*.tsx" "app\[slug]\customers\page.tsx"
call :copyfile "gift-cards-page*.tsx" "app\[slug]\gift-cards\page.tsx"
call :copyfile "instructor-dashboard-page*.tsx" "app\[slug]\instructor\page.tsx"
call :copyfile "instructor-messages-page*.tsx" "app\[slug]\instructor\messages\page.tsx"
call :copyfile "instructor-messages-id-page*.tsx" "app\[slug]\instructor\messages\[id]\page.tsx"
call :copyfile "instructor-shop-page*.tsx" "app\[slug]\instructor\shop\page.tsx"
call :copyfile "instructor-staffmessages-page*.tsx" "app\[slug]\instructor\staff-messages\page.tsx"
call :copyfile "instructor-staffmessages-id-page*.tsx" "app\[slug]\instructor\staff-messages\[id]\page.tsx"
call :copyfile "instructor-swingsketch-page*.tsx" "app\[slug]\instructor\swing-sketch\page.tsx"
call :copyfile "instructor-swingsketch-id-page*.tsx" "app\[slug]\instructor\swing-sketch\[id]\page.tsx"
call :copyfile "instructor-videos-page*.tsx" "app\[slug]\instructor\videos\page.tsx"
call :copyfile "join-as-instructor-page*.tsx" "app\[slug]\join-as-instructor\page.tsx"
call :copyfile "messages-page*.tsx" "app\[slug]\messages\page.tsx"
call :copyfile "messages-id-page*.tsx" "app\[slug]\messages\[id]\page.tsx"
call :copyfile "reports-page*.tsx" "app\[slug]\reports\page.tsx"
call :copyfile "review-bookingId-page*.tsx" "app\[slug]\review\[bookingId]\page.tsx"
call :copyfile "route-page*.tsx" "app\[slug]\route\page.tsx"
call :copyfile "settings-page*.tsx" "app\[slug]\settings\page.tsx"
call :copyfile "shop-page*.tsx" "app\[slug]\shop\page.tsx"
call :copyfile "swing-session-page*.tsx" "app\[slug]\swing-session\page.tsx"
call :copyfile "swing-sketches-page*.tsx" "app\[slug]\swing-sketches\page.tsx"
call :copyfile "videos-page*.tsx" "app\[slug]\videos\page.tsx"

echo.
echo Done. Now run:  git status
echo to see everything that changed, then add/commit/push as usual.
pause
exit /b 0

:copyfile
set "PATTERN=%~1"
set "DEST=%~2"
set "SRC="
for /f "delims=" %%F in ('dir /b /o-d "%DL%\%PATTERN%" 2^>nul') do (
  if not defined SRC set "SRC=%%F"
)
if not defined SRC (
  echo   [MISSING] nothing matching %PATTERN% in Downloads - skipped %DEST%
  exit /b 0
)
for %%D in ("%DEST%") do set "DESTDIR=%%~dpD"
if not exist "!DESTDIR!" mkdir "!DESTDIR!" >nul 2>nul
copy /Y "%DL%\!SRC!" "%DEST%" >nul
echo   [OK] !SRC!  -^>  %DEST%
exit /b 0
