<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['role', 'module', 'niveau'])]
class PermissionRole extends Model
{
    protected $table = 'permissions_roles';
}
