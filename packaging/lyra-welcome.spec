Name:           lyra-welcome
Version:        0.1.0
Release:        0
%global debug_package %{nil}
Summary:        First-login welcome application for Lyra OS
License:        GPL-3.0-only
URL:            https://github.com/britors/Lyra
Source0:        %{name}-%{version}.tar.zst
Source1:        vendor.tar.zst

BuildRequires:  cargo
BuildRequires:  cargo-packaging
BuildRequires:  desktop-file-utils
BuildRequires:  gtk3-devel
BuildRequires:  libsoup-devel
BuildRequires:  pkgconfig
BuildRequires:  rust >= 1.85
BuildRequires:  webkit2gtk3-devel
BuildRequires:  zstd
Requires:       bash
Requires:       coreutils

%description
Lyra Welcome is the small, localized introduction shown once on the first
graphical login of every installed Lyra OS user. It has no network access and
does not require administrative privileges.

%prep
%autosetup -a1
sed -i 's|^directory = .*|directory = "vendor"|' src-tauri/.cargo/config.toml
test -d src-tauri/vendor

%build
cd src-tauri
%{cargo_build}

%install
install -Dm0755 src-tauri/target/release/lyra-welcome \
    %{buildroot}%{_bindir}/lyra-welcome
install -Dm0755 packaging/lyra-welcome-first-login \
    %{buildroot}%{_bindir}/lyra-welcome-first-login
install -Dm0644 packaging/org.lyraos.LyraWelcome.desktop \
    %{buildroot}%{_datadir}/applications/org.lyraos.LyraWelcome.desktop
install -Dm0644 packaging/org.lyraos.LyraWelcome-autostart.desktop \
    %{buildroot}%{_sysconfdir}/xdg/autostart/org.lyraos.LyraWelcome.desktop
install -Dm0644 packaging/org.lyraos.LyraWelcome.svg \
    %{buildroot}%{_datadir}/icons/hicolor/scalable/apps/org.lyraos.LyraWelcome.svg
%{__strip} --strip-all %{buildroot}%{_bindir}/lyra-welcome
desktop-file-validate %{buildroot}%{_datadir}/applications/org.lyraos.LyraWelcome.desktop
desktop-file-validate %{buildroot}%{_sysconfdir}/xdg/autostart/org.lyraos.LyraWelcome.desktop

%check
cd src-tauri
cargo check --offline
bash -n ../packaging/lyra-welcome-first-login

%files
%license LICENSE
%doc README.md
%{_bindir}/lyra-welcome
%{_bindir}/lyra-welcome-first-login
%{_datadir}/applications/org.lyraos.LyraWelcome.desktop
%{_datadir}/icons/hicolor/scalable/apps/org.lyraos.LyraWelcome.svg
%{_sysconfdir}/xdg/autostart/org.lyraos.LyraWelcome.desktop

%changelog
