# add-periodic-checks: parte do Welcome

Proposta-mãe: [lyra-ecosystem/openspec/changes/add-periodic-checks](https://github.com/lyra-os-linux/lyra-ecosystem/tree/main/openspec/changes/add-periodic-checks). O Welcome entrou a pedido do mantenedor em 30/10/2026.

Na página do Vega, o cartão **Verificação semanal da saúde** diz que a verificação está ligada e tem uma chave para desligar. O Welcome lê e muda pelo `gdbus` (`Diagnostics.GetPeriodic`/`SetPeriodic` do vegad), mantém a frequência e mostra o estado relido do sistema; desligar pede a senha de administrador pelo polkit. Com um vegad sem a verificação, o cartão não aparece.
