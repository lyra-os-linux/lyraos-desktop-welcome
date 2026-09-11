//! Delegate to Vega's public profile contract, including its saved preferences.
//! No independent copies of presets, settings keys or extension toggles here.
use std::process::{Command, Stdio};

const VEGA: &str = "/usr/bin/vega-gtk";
const IDS: [&str; 5] = ["lyra", "vanilla", "ubuntu", "windows10", "windows11"];

fn invoke(arguments: &[&str]) -> Result<String, String> {
    let output = Command::new(VEGA)
        .arg("--desktop-profile")
        .args(arguments)
        .stdin(Stdio::null())
        .output()
        .map_err(|error| error.to_string())?;
    if !output.status.success() {
        return Err("Vega could not read or apply the desktop profile".into());
    }
    parse_profile(&output.stdout)
}

fn parse_profile(output: &[u8]) -> Result<String, String> {
    let value = std::str::from_utf8(output)
        .map_err(|_| "invalid profile response")?
        .trim();
    if IDS.contains(&value) {
        Ok(value.into())
    } else {
        Err("unknown profile response".into())
    }
}

pub fn current() -> Result<String, String> {
    invoke(&["get"])
}

pub fn apply(profile: &str) -> Result<(), String> {
    if !IDS.contains(&profile) {
        return Err("unknown desktop profile".into());
    }
    let actual = invoke(&["set", profile])?;
    if actual == profile {
        Ok(())
    } else {
        Err("desktop profile readback differs from the request".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_machine_output_without_inventing_defaults() {
        for id in IDS {
            assert_eq!(parse_profile(format!("{id}\n").as_bytes()).unwrap(), id);
        }
        for value in [
            b"".as_slice(),
            b"lyra\nubuntu",
            b"unavailable",
            b"GNOME",
            &[255],
        ] {
            assert!(parse_profile(value).is_err());
        }
        // Invalid input is rejected before invoking any system command.
        assert!(apply("invalid").is_err());
    }
}
