//! `IndexNow` key (`indexnow`): `sha256(origin)` hex, first 32 characters.
//! Independent of the build so the key file is stable across deploys.

use sha2::{Digest, Sha256};

/// The key, which is also the key file's basename and contents.
pub fn key(origin: &str) -> String {
    let digest = Sha256::digest(origin.as_bytes());
    let mut hex = String::with_capacity(64);
    for b in digest {
        hex.push_str(&format!("{b:02x}"));
    }
    hex.truncate(32);
    hex
}

#[cfg(test)]
mod tests {
    #[test]
    fn stable_32_hex() {
        let k = super::key("https://example.com");
        assert_eq!(k.len(), 32);
        assert_eq!(k, super::key("https://example.com"));
        assert!(k.chars().all(|c| c.is_ascii_hexdigit()));
    }
}
