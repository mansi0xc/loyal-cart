use near_sdk::{near, PanicOnDefault};

pub const VERSION: &str = "0.1.0-cp1";

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct AgentAccount {
    pub version: String,
}

#[near]
impl AgentAccount {
    #[init]
    pub fn new() -> Self {
        Self {
            version: VERSION.to_string(),
        }
    }

    pub fn ping(&self) -> String {
        "pong".to_string()
    }

    pub fn version(&self) -> String {
        self.version.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ping_returns_pong() {
        let contract = AgentAccount::new();
        assert_eq!(contract.ping(), "pong");
    }

    #[test]
    fn version_is_cp1() {
        let contract = AgentAccount::new();
        assert_eq!(contract.version(), VERSION);
    }
}
