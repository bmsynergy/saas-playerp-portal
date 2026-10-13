-- PE-439.3 PROPOSAL ONLY: not applied, not a backend migration registration.
-- Tom: verify live definition; version in backend _migrations before DEV deployment.
-- Target only Supabase DEV fzwzmwstxlsxdzdmphyq. No production.
CREATE OR REPLACE FUNCTION public.ps_admin_legacy_credentials_reconcile(p_serial text, p_print_server_id uuid, p_ca_der_sha256 text, p_kind text, p_values jsonb, p_method text, p_physical_check boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_dev public.ps_devices;
  v_ps public.print_servers;
  v_cred public.ps_device_credentials;
  v_ca text := lower(replace(coalesce(p_ca_der_sha256, ''), ':', ''));
  v_ssid text := p_values ->> 'ssid';
  v_psk text := p_values ->> 'psk';
  v_code text := p_values ->> 'admin_code';
  v_out jsonb;
  v_at timestamptz;
  v_expected text;
begin
  if auth.uid() is null or not public.is_platform_staff(array['super_admin']::text[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  <<op>>
  begin
    if p_kind is null or p_kind not in ('wifi', 'admin_code') then
      v_out := jsonb_build_object('ok', false, 'error', 'bad_kind'); exit op;
    end if;
    v_expected := case p_kind when 'wifi' then 'recovery_read_and_join' else 'local_login' end;
    if p_method is distinct from v_expected then
      v_out := jsonb_build_object('ok', false, 'error', 'bad_method'); exit op;
    end if;
    if p_physical_check is not true then
      v_out := jsonb_build_object('ok', false, 'error', 'physical_check_required'); exit op;
    end if;
    select * into v_dev from public.ps_devices where serial = p_serial for update;
    if v_dev.id is null then
      v_out := jsonb_build_object('ok', false, 'error', 'device_not_found'); exit op;
    end if;
    if not v_dev.legacy then
      v_out := jsonb_build_object('ok', false, 'error', 'not_legacy'); exit op;
    end if;
    select * into v_ps from public.print_servers where id = p_print_server_id;
    if v_ps.id is null or v_ps.status <> 'active' or v_dev.status <> 'assigned' then
      v_out := jsonb_build_object('ok', false, 'error', 'print_server_not_active'); exit op;
    end if;
    if v_dev.venue_id is distinct from v_ps.venue_id
       or not (v_ps.inventory_device_id = v_dev.id or v_dev.print_server_id = v_ps.id) then
      v_out := jsonb_build_object('ok', false, 'error', 'device_not_linked'); exit op;
    end if;
    if v_ps.ca_cert_der_sha256 is null or v_ca <> lower(replace(v_ps.ca_cert_der_sha256, ':', '')) then
      v_out := jsonb_build_object('ok', false, 'error', 'ca_mismatch'); exit op;
    end if;
    if p_kind = 'wifi' and (v_ssid is null or octet_length(v_ssid) not between 1 and 32
                            or v_psk is null or not (v_psk ~ '^[ -~]{8,63}$')) then
      v_out := jsonb_build_object('ok', false, 'error', 'invalid_value'); exit op;
    end if;
    if p_kind = 'admin_code' then
      -- PE-439.3: normalize only canonical, 5-5 and historical 4-4-2 forms.
      -- Preserve all other legacy values exactly; never migrate existing secrets.
      if coalesce(v_code, '') ~* '^([ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}|[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}|[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{2})$' then
        v_code := upper(replace(v_code, '-', ''));
      end if;
      if v_code is null or not (v_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$' or v_code ~ '^[!-~]{4,64}$') then
        v_out := jsonb_build_object('ok', false, 'error', 'invalid_value'); exit op;
      end if;
    end if;
    select * into v_cred from public.ps_device_credentials where device_id = v_dev.id for update;
    if (p_kind = 'wifi' and v_cred.wifi_applied_at is not null)
       or (p_kind = 'admin_code' and v_cred.admin_code_applied_at is not null) then
      v_out := jsonb_build_object('ok', false, 'error', 'already_confirmed'); exit op;
    end if;
    if v_cred.device_id is null then
      insert into public.ps_device_credentials (device_id, updated_at) values (v_dev.id, now());
    end if;
    v_at := now();
    perform set_config('playerp.ps_cred_confirm', 'legacy_reconcile_' || p_kind, true);
    if p_kind = 'wifi' then
      update public.ps_device_credentials
         set wifi_ssid = v_ssid, wifi_psk = v_psk, wifi_applied_at = v_at,
             wifi_confirm_method = 'recovery_read_and_join', updated_at = v_at
       where device_id = v_dev.id;
    else
      update public.ps_device_credentials
         set admin_code = v_code, admin_code_applied_at = v_at,
             admin_code_confirm_method = 'local_login', updated_at = v_at
       where device_id = v_dev.id;
    end if;
    perform set_config('playerp.ps_cred_confirm', '', true);
    v_out := jsonb_build_object('ok', true, 'kind', p_kind, 'applied_at', v_at, 'device_id', v_dev.id);
  end;
  -- Auditoría sin valores: quién (auth.uid), cuándo, serial, PS, huella comprobada y método.
  perform public._ps_panel_audit(coalesce(v_ps.venue_id, v_dev.venue_id), 'ps_legacy_credentials_reconcile',
    'print_server', coalesce(v_ps.id, p_print_server_id), v_out,
    jsonb_build_object('serial', p_serial, 'device_id', v_dev.id, 'print_server_id', p_print_server_id,
                       'kind', p_kind, 'method', p_method, 'physical_check', p_physical_check,
                       'ca_der_sha256', nullif(v_ca, '')));
  return v_out;
end;
$function$;
